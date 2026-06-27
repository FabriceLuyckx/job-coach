import json
import re
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from bs4 import BeautifulSoup
from pydantic import BaseModel

from app import config, db
from app.services.cv_generator import (
    DEFAULT_CV_PROMPT, TailoringPlan, apply_tailoring, tailor, _is_active, _start_key,
)
from app.services.cv_renderer import LABELS, OUTPUT_DIR, PROFILE_PATH, build_env, load_photo

router = APIRouter(prefix="/api/cv", tags=["cv"])

# In-memory job store for async generation
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()


class GenerateRequest(BaseModel):
    url: str
    lang: str = "en"


class RerenderRequest(BaseModel):
    summary: str | None = None


class RelangRequest(BaseModel):
    lang: str


class RoleEdit(BaseModel):
    id: str
    bullets: list[str]


class PlanEdit(BaseModel):
    summary: str
    roles: list[RoleEdit]


def _load_plans(row: dict) -> dict[str, dict]:
    """Return {lang: plan_dict} for a history row, migrating from the legacy
    single plan_json column when plans_json isn't populated yet."""
    if row.get("plans_json"):
        return json.loads(row["plans_json"])
    if row.get("plan_json"):
        return {row["lang"]: json.loads(row["plan_json"])}
    return {}


def _persist_plans(id: str, lang: str, plans: dict[str, dict]) -> None:
    """Write the per-language plans and mirror the active language into the
    legacy columns (lang/plan_json/summary/tailoring_notes) used by the history
    list and older readers."""
    cur = plans.get(lang, {})
    with db.get_db() as conn:
        conn.execute(
            "UPDATE cv_history SET lang = ?, plans_json = ?, plan_json = ?, "
            "summary = ?, tailoring_notes = ? WHERE id = ?",
            (lang, json.dumps(plans), json.dumps(cur) if cur else None,
             cur.get("summary", ""), cur.get("tailoring_notes", ""), id),
        )


def _render_html(plan: TailoringPlan, profile: dict, lang: str) -> str:
    """Apply tailoring plan and render the CV HTML (current template + profile)."""
    tailored = apply_tailoring(profile, plan)
    include_photo = profile.get("cv_design_preferences", {}).get("include_photo", False)
    photo_uri = load_photo() if include_photo else None
    env = build_env()
    return env.get_template("default.html").render(
        **tailored, labels=LABELS[lang], lang=lang, photo=photo_uri,
    )


def _render_and_save(plan: TailoringPlan, profile: dict, lang: str) -> str:
    """Render HTML and write it to output/<slug>/cv_<lang>.html. Returns slug."""
    html = _render_html(plan, profile, lang)
    out_dir = OUTPUT_DIR / plan.slug
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"cv_{lang}.html").write_text(html, encoding="utf-8")
    return plan.slug


def _current_html(slug: str, lang: str) -> str | None:
    """CV HTML for preview/PDF. If a tailoring plan is stored for this language,
    re-render from it against the current template + profile so layout/colour/
    profile edits are always live (and refresh the cached file); otherwise fall
    back to the saved file (e.g. plan-less entries that were only summary-patched)."""
    with db.get_db() as conn:
        row = conn.execute(
            "SELECT * FROM cv_history WHERE slug = ? ORDER BY created_at DESC LIMIT 1",
            (slug,),
        ).fetchone()
    if row and PROFILE_PATH.exists():
        plans = _load_plans(dict(row))
        if lang in plans:
            plan = TailoringPlan(**plans[lang])
            plan.slug = slug
            profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
            html = _render_html(plan, profile, lang)
            out_dir = OUTPUT_DIR / slug
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"cv_{lang}.html").write_text(html, encoding="utf-8")
            return html
    path = OUTPUT_DIR / slug / f"cv_{lang}.html"
    return path.read_text(encoding="utf-8") if path.exists() else None


def _run_generation(job_id: str, url: str, lang: str) -> None:
    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"

        cfg = config.load()
        api_key = cfg.get("openrouter_api_key", "")
        model = cfg.get("openrouter_model", "anthropic/claude-sonnet-4-6")
        if not api_key:
            raise ValueError("OpenRouter API key not configured. Set it in Settings.")
        if not PROFILE_PATH.exists():
            raise ValueError("profile.json not found")

        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        prompt = cfg.get("cv_prompt") or DEFAULT_CV_PROMPT
        plan = tailor(profile, url, api_key, model, lang, prompt)
        slug = _render_and_save(plan, profile, lang)

        history_id = str(uuid.uuid4())
        plan_dict = asdict(plan)
        with db.get_db() as conn:
            conn.execute(
                """INSERT INTO cv_history
                   (id, slug, job_title, employer, job_url, lang, tailoring_notes, summary, plan_json, plans_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    history_id, slug, plan.job_title, plan.employer, url, lang,
                    plan.tailoring_notes, plan.summary, json.dumps(plan_dict),
                    json.dumps({lang: plan_dict}),
                    datetime.now(timezone.utc).isoformat(),
                ),
            )

        with _jobs_lock:
            _jobs[job_id].update({
                "status": "done",
                "result": {
                    "history_id": history_id,
                    "slug": slug,
                    "job_title": plan.job_title,
                    "employer": plan.employer,
                    "tailoring_notes": plan.tailoring_notes,
                    "summary": plan.summary,
                    "preview_url": f"/api/cv/preview/{slug}/{lang}",
                    "job_url": url,
                    "lang": lang,
                    "has_plan": True,
                },
            })
    except Exception as e:
        with _jobs_lock:
            _jobs[job_id].update({"status": "error", "error": str(e)})


def start_generation(url: str, lang: str = "en") -> str:
    """Kick off async CV generation for a job URL; returns the poll job_id.
    Shared by the /generate endpoint and the Jobs 'accept' flow."""
    if lang not in LABELS:
        raise HTTPException(400, f"Unknown lang '{lang}'. Choices: {list(LABELS)}")
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {"status": "pending"}
    threading.Thread(target=_run_generation, args=(job_id, url, lang), daemon=True).start()
    return job_id


@router.post("/generate")
def generate_cv(body: GenerateRequest):
    return {"job_id": start_generation(body.url, body.lang)}


@router.get("/status/{job_id}")
def get_job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    return job


@router.get("/history")
def get_history():
    with db.get_db() as conn:
        rows = conn.execute(
            """SELECT id, slug, job_title, employer, job_url, lang, tailoring_notes, summary,
                      (plan_json IS NOT NULL OR plans_json IS NOT NULL) AS has_plan, created_at
               FROM cv_history ORDER BY created_at DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/history/{id}")
def delete_history(id: str):
    with db.get_db() as conn:
        row = conn.execute("SELECT id FROM cv_history WHERE id = ?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        conn.execute("DELETE FROM cv_history WHERE id = ?", (id,))
    return {"ok": True}


@router.post("/rerender/{id}")
def rerender_cv(id: str, body: RerenderRequest):
    """Re-render the current-language CV from its stored plan + latest profile
    (cheap, no AI). For plan-less legacy entries, re-tailor from the job URL."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        row = dict(row)

    lang = row["lang"]
    plans = _load_plans(row)

    if lang in plans:
        if not PROFILE_PATH.exists():
            raise HTTPException(500, "profile.json not found")
        plan_data = plans[lang]
        if body.summary is not None:
            plan_data["summary"] = body.summary
            plans[lang] = plan_data
            _persist_plans(id, lang, plans)
        plan = TailoringPlan(**plan_data)
        plan.slug = row["slug"]
        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        _render_and_save(plan, profile, lang)
    elif row.get("job_url"):
        # No stored plan (older entry) but we have the URL: re-tailor so profile
        # edits are reflected and a plan gets stored for future edits.
        _retailor(id, row, lang)
    # else: nothing to do (caller just reloads the iframe)

    return {"ok": True}


def _retailor(id: str, row: dict, lang: str, keep_edits: bool = False) -> dict:
    """Re-run AI tailoring from the stored job URL for the given language, save
    the new HTML, and store the plan for that language. Used by relang + regenerate.

    keep_edits: preserve the user's edited summary, role selection and bullets,
    only pulling in the freshly generated bits (e.g. sidebar translations,
    tailoring notes) — so a regenerate can add new content without losing edits."""
    if not row.get("job_url"):
        raise HTTPException(400, "No job URL stored for this CV, so it can't be regenerated.")

    cfg = config.load()
    api_key = cfg.get("openrouter_api_key", "")
    model = cfg.get("openrouter_model", "anthropic/claude-sonnet-4-6")
    if not api_key:
        raise HTTPException(400, "OpenRouter API key not configured. Set it in Settings.")
    if not PROFILE_PATH.exists():
        raise HTTPException(500, "profile.json not found")

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    prompt = cfg.get("cv_prompt") or DEFAULT_CV_PROMPT
    plan = tailor(profile, row["job_url"], api_key, model, lang, prompt)
    plan.slug = row["slug"]  # keep slug so history identity is stable

    plans = _load_plans(row)
    if keep_edits and lang in plans:
        # Overlay the user's edited, visible content on top of the fresh plan;
        # everything else (sidebar_translations, notes, skills) comes in fresh.
        old = plans[lang]
        plan.summary = old.get("summary", plan.summary)
        plan.selected_experience_ids = old.get("selected_experience_ids") or plan.selected_experience_ids
        plan.adjusted_responsibilities = old.get("adjusted_responsibilities") or plan.adjusted_responsibilities
        plan.include_publications = old.get("include_publications", plan.include_publications)
        plan.job_title = old.get("job_title", plan.job_title)
        plan.employer = old.get("employer", plan.employer)

    _render_and_save(plan, profile, lang)
    plans[lang] = asdict(plan)
    _persist_plans(id, lang, plans)

    return {"lang": lang, "slug": plan.slug, "summary": plan.summary,
            "tailoring_notes": plan.tailoring_notes,
            "preview_url": f"/api/cv/preview/{plan.slug}/{lang}"}


@router.post("/relang/{id}")
def relang_cv(id: str, body: RelangRequest):
    """Switch a CV to another language. If a plan for that language already exists
    (incl. your edits), reuse it — no AI call, no lost edits. Otherwise re-tailor."""
    if body.lang not in LABELS:
        raise HTTPException(400, f"Unknown lang '{body.lang}'. Choices: {list(LABELS)}")
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    plans = _load_plans(row)

    if body.lang in plans:
        _persist_plans(id, body.lang, plans)
        cur = plans[body.lang]
        return {"lang": body.lang, "slug": row["slug"],
                "summary": cur.get("summary", ""), "tailoring_notes": cur.get("tailoring_notes", ""),
                "preview_url": f"/api/cv/preview/{row['slug']}/{body.lang}"}

    return _retailor(id, row, body.lang)


class RegenerateRequest(BaseModel):
    keep_edits: bool = False


@router.post("/regenerate/{id}")
def regenerate_cv(id: str, body: RegenerateRequest):
    """Re-run AI tailoring for the CV's CURRENT language. With keep_edits=True the
    user's summary, role selection and bullets are preserved and only the rest is
    refreshed; otherwise the whole CV is regenerated from scratch."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    return _retailor(id, row, row["lang"], keep_edits=body.keep_edits)


@router.get("/plan/{id}")
def get_plan(id: str):
    """Return the editable AI-generated content (summary + per-role bullets) for
    the CV's current language, for the in-app editor."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    lang = row["lang"]
    plans = _load_plans(row)
    if lang not in plans:
        raise HTTPException(400, "No editable plan for this CV — use Regenerate first.")
    if not PROFILE_PATH.exists():
        raise HTTPException(500, "profile.json not found")

    plan = TailoringPlan(**plans[lang])
    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    exp_by_id = {e["id"]: e for e in profile.get("experience", [])}
    selected = [exp_by_id[eid] for eid in plan.selected_experience_ids if eid in exp_by_id]
    # Same ordering the CV uses: active roles first (selected order), then past
    # roles by newest start date — so the editor matches the rendered CV.
    ordered = [e for e in selected if _is_active(e)] + \
        sorted((e for e in selected if not _is_active(e)), key=_start_key, reverse=True)
    roles = [{
        "id": e["id"],
        "title": e.get("title", ""),
        "employer": e.get("employer", ""),
        "bullets": plan.adjusted_responsibilities.get(e["id"], e.get("responsibilities", [])),
    } for e in ordered]
    return {"lang": lang, "summary": plan.summary, "roles": roles}


@router.put("/plan/{id}")
def put_plan(id: str, body: PlanEdit):
    """Save edits to the AI-generated content for the current language, then
    re-render. Edits are stored per-language so switching language keeps them."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    lang = row["lang"]
    plans = _load_plans(row)
    if lang not in plans:
        raise HTTPException(400, "No editable plan for this CV — use Regenerate first.")
    if not PROFILE_PATH.exists():
        raise HTTPException(500, "profile.json not found")

    plan = TailoringPlan(**plans[lang])
    plan.summary = body.summary
    for r in body.roles:
        plan.adjusted_responsibilities[r.id] = r.bullets[:4]
    plans[lang] = asdict(plan)
    _persist_plans(id, lang, plans)

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    plan.slug = row["slug"]
    _render_and_save(plan, profile, lang)
    return {"ok": True, "summary": plan.summary}


_PRINT_SCRIPT = (
    '<script>window.addEventListener("load",function(){'
    'document.fonts.ready.then(function(){window.print()})'
    '})</script>'
)


def _maybe_print(html: str, autoprint: bool) -> str:
    if not autoprint:
        return html
    return html.replace("</body>", _PRINT_SCRIPT + "</body>", 1)


@router.get("/summary/{id}")
def get_cv_summary(id: str):
    """Return the summary text for a history entry (from DB, or parsed from the HTML file)."""
    with db.get_db() as conn:
        row = conn.execute(
            "SELECT slug, lang, summary FROM cv_history WHERE id = ?", (id,)
        ).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    if row.get("summary"):
        return {"summary": row["summary"]}
    path = OUTPUT_DIR / row["slug"] / f"cv_{row['lang']}.html"
    if not path.exists():
        raise HTTPException(404, "CV file not found")
    soup = BeautifulSoup(path.read_text(encoding="utf-8"), "html.parser")
    el = soup.find(attrs={"data-section": "summary"})
    return {"summary": el.get_text(strip=True) if el else ""}


@router.post("/summary/{id}/generate")
def generate_cv_summary(id: str):
    """Regenerate just the professional summary via AI, patch the HTML, update DB."""
    from openai import OpenAI
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)

    cfg = config.load()
    api_key = cfg.get("openrouter_api_key", "")
    model_id = cfg.get("openrouter_model", "anthropic/claude-sonnet-4-6")
    if not api_key:
        raise HTTPException(400, "OpenRouter API key not configured")
    if not PROFILE_PATH.exists():
        raise HTTPException(500, "profile.json not found")

    profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
    lang = row["lang"]
    lang_name = {"en": "English", "nl": "Dutch (Nederlands)"}.get(lang, "English")

    plans = _load_plans(row)
    plan_data = plans.get(lang)
    if plan_data:
        job_context = (
            f"Job title: {plan_data.get('job_title', row['job_title'])}\n"
            f"Employer: {plan_data.get('employer', row['employer'])}\n"
            f"Tailoring notes: {plan_data.get('tailoring_notes', '')}"
        )
    else:
        job_context = f"Job title: {row['job_title']}\nEmployer: {row['employer']}"

    client = OpenAI(base_url="https://openrouter.ai/api/v1", api_key=api_key)
    response = client.chat.completions.create(
        model=model_id,
        max_tokens=512,
        messages=[
            {
                "role": "system",
                "content": (
                    f"You are an expert career coach. Write a professional CV summary in {lang_name}.\n"
                    "Rules: first person (I, my), maximum 4 sentences, direct and specific to the role.\n\n"
                    f"CANDIDATE PROFILE:\n{json.dumps(profile, ensure_ascii=False, indent=2)}"
                ),
            },
            {
                "role": "user",
                "content": f"Write a professional summary for this application:\n\n{job_context}",
            },
        ],
    )
    new_summary = response.choices[0].message.content.strip()

    if plan_data:
        # Persist into the per-language plan and re-render from it.
        plan_data["summary"] = new_summary
        plans[lang] = plan_data
        _persist_plans(id, lang, plans)
        plan = TailoringPlan(**plan_data)
        plan.slug = row["slug"]
        _render_and_save(plan, profile, lang)
    else:
        with db.get_db() as conn:
            conn.execute("UPDATE cv_history SET summary = ? WHERE id = ?", (new_summary, id))

    return {"summary": new_summary}


@router.get("/preview/{slug}", response_class=HTMLResponse)
def preview_cv(slug: str, print: bool = Query(False, alias="print")):
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    for lang in ("en", "nl"):
        html = _current_html(slug, lang)
        if html is not None:
            return HTMLResponse(_maybe_print(html, print))
    raise HTTPException(404, "CV not found")


@router.get("/preview/{slug}/{lang}", response_class=HTMLResponse)
def preview_cv_lang(slug: str, lang: str, print: bool = Query(False, alias="print")):
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    if lang not in LABELS:
        raise HTTPException(400, "Unknown lang")
    html = _current_html(slug, lang)
    if html is None:
        raise HTTPException(404, "CV not found")
    return HTMLResponse(_maybe_print(html, print))


@router.get("/pdf/{slug}/{lang}")
def pdf_cv(slug: str, lang: str):
    """Render the CV to a real PDF (headless Chromium) and return as a download."""
    from app.services.pdf import html_to_pdf

    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    if lang not in LABELS:
        raise HTTPException(400, "Unknown lang")
    html = _current_html(slug, lang)
    if html is None:
        raise HTTPException(404, "CV not found")
    pdf = html_to_pdf(html)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cv_{slug}_{lang}.pdf"'},
    )
