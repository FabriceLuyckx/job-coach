import json
import re
import threading
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse
from bs4 import BeautifulSoup
from pydantic import BaseModel

from app import config, db
from app.services.cv_generator import TailoringPlan, apply_tailoring, tailor
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


def _render_and_save(plan: TailoringPlan, profile: dict, lang: str) -> str:
    """Apply tailoring plan, render HTML, write file. Returns slug."""
    tailored = apply_tailoring(profile, plan)
    include_photo = profile.get("cv_design_preferences", {}).get("include_photo", False)
    photo_uri = load_photo() if include_photo else None
    env = build_env()
    html = env.get_template("default.html").render(
        **tailored, labels=LABELS[lang], lang=lang, photo=photo_uri,
    )
    slug = plan.slug
    out_dir = OUTPUT_DIR / slug
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / f"cv_{lang}.html").write_text(html, encoding="utf-8")
    return slug


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
        plan = tailor(profile, url, api_key, model, lang)
        slug = _render_and_save(plan, profile, lang)

        history_id = str(uuid.uuid4())
        with db.get_db() as conn:
            conn.execute(
                """INSERT INTO cv_history
                   (id, slug, job_title, employer, job_url, lang, tailoring_notes, summary, plan_json, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    history_id, slug, plan.job_title, plan.employer, url, lang,
                    plan.tailoring_notes, plan.summary, json.dumps(asdict(plan)),
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


@router.post("/generate")
def generate_cv(body: GenerateRequest):
    if body.lang not in LABELS:
        raise HTTPException(400, f"Unknown lang '{body.lang}'. Choices: {list(LABELS)}")
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _jobs[job_id] = {"status": "pending"}
    threading.Thread(target=_run_generation, args=(job_id, body.url, body.lang), daemon=True).start()
    return {"job_id": job_id}


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
                      (plan_json IS NOT NULL) AS has_plan, created_at
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
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (id,)).fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        row = dict(row)

    lang = row["lang"]
    slug = row["slug"]

    if row.get("plan_json"):
        # Full re-render from plan — picks up any profile changes too
        plan_data = json.loads(row["plan_json"])
        if body.summary is not None:
            plan_data["summary"] = body.summary
        plan = TailoringPlan(**plan_data)
        if not PROFILE_PATH.exists():
            raise HTTPException(500, "profile.json not found")
        profile = json.loads(PROFILE_PATH.read_text(encoding="utf-8"))
        _render_and_save(plan, profile, lang)
    elif body.summary is not None:
        # No plan stored: patch summary text directly in the rendered HTML file
        path = OUTPUT_DIR / slug / f"cv_{lang}.html"
        if not path.exists():
            raise HTTPException(404, "CV file not found")
        html = path.read_text(encoding="utf-8")
        new_summary = body.summary
        new_html = re.sub(
            r'(<div\s+class="summary"\s+data-section="summary">)(.*?)(</div>)',
            lambda m: m.group(1) + new_summary + m.group(3),
            html,
            count=1,
            flags=re.DOTALL,
        )
        path.write_text(new_html, encoding="utf-8")
    # else: no plan, no summary change — nothing to do (caller just reloads iframe)

    if body.summary is not None:
        with db.get_db() as conn:
            conn.execute("UPDATE cv_history SET summary = ? WHERE id = ?", (body.summary, id))

    return {"ok": True}


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

    if row.get("plan_json"):
        plan_data = json.loads(row["plan_json"])
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

    slug = row["slug"]
    path = OUTPUT_DIR / slug / f"cv_{lang}.html"
    if path.exists():
        html = path.read_text(encoding="utf-8")
        patched = re.sub(
            r'(<div\s+class="summary"\s+data-section="summary">)(.*?)(</div>)',
            lambda m: m.group(1) + new_summary + m.group(3),
            html, count=1, flags=re.DOTALL,
        )
        path.write_text(patched, encoding="utf-8")

    with db.get_db() as conn:
        conn.execute("UPDATE cv_history SET summary = ? WHERE id = ?", (new_summary, id))

    return {"summary": new_summary}


@router.get("/preview/{slug}", response_class=HTMLResponse)
def preview_cv(slug: str, print: bool = Query(False, alias="print")):
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    for lang in ("en", "nl"):
        path = OUTPUT_DIR / slug / f"cv_{lang}.html"
        if path.exists():
            return HTMLResponse(_maybe_print(path.read_text(encoding="utf-8"), print))
    raise HTTPException(404, "CV not found")


@router.get("/preview/{slug}/{lang}", response_class=HTMLResponse)
def preview_cv_lang(slug: str, lang: str, print: bool = Query(False, alias="print")):
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    if lang not in LABELS:
        raise HTTPException(400, "Unknown lang")
    path = OUTPUT_DIR / slug / f"cv_{lang}.html"
    if not path.exists():
        raise HTTPException(404, "CV not found")
    return HTMLResponse(_maybe_print(path.read_text(encoding="utf-8"), print))
