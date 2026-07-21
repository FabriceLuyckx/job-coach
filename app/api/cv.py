# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

import json
import re
import threading
import time
import uuid
from dataclasses import asdict
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import HTMLResponse, Response
from jinja2 import TemplateNotFound
from pydantic import BaseModel

from app import config, db
from app.services.cv_generator import (
    DEFAULT_CV_PROMPT, TailoringPlan, apply_tailoring, detect_language,
    fetch_job_description, tailor, ordered_experience,
)
from app.api.i18n import ensure_cv_labels
from app.i18n.languages import is_valid_code, lang_name
from app.services.cv_renderer import (
    GENERIC_URL, OUTPUT_DIR, PROFILE_PATH, build_env, cv_labels, list_templates, load_photo,
    load_profile, profile_for_tailoring, profile_ready, role_brief,
)
from app.services.llm import AIResponseError, GenerationCancelled, complete, current_cancel, message_text


def _clean_lang(lang: str) -> str:
    """Sanitize a language code from a request path/body to a bare 2-letter code."""
    return re.sub(r"[^a-z]", "", (lang or "").lower())[:2]

router = APIRouter(prefix="/api/cv", tags=["cv"])

# In-memory job store for async generation
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_JOB_TTL = 3600  # seconds a finished generation status stays queryable


def _evict_jobs() -> None:
    """Drop hour-old job statuses so a long-lived process doesn't leak memory.
    Caller must hold _jobs_lock."""
    cutoff = time.time() - _JOB_TTL
    for jid in [j for j, v in _jobs.items() if v.get("created", 0) < cutoff]:
        del _jobs[jid]


def _set_stage(job_id: str, stage: str) -> None:
    """Record a coarse progress stage (fetching|thinking|rendering) for polling."""
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["stage"] = stage


def run_async(fn) -> str:
    """Run fn(set_stage) on a daemon thread; return a job_id the client polls via
    GET /status/{job_id}. fn's return value becomes the job's `result`; exceptions
    become an `error`. The one pattern behind every long AI call (C3/H1).

    Each job carries a cancel Event (set via POST /cancel/{job_id}); the worker
    publishes it as the thread's current_cancel so complete() can interrupt a slow
    local generation and free the engine."""
    job_id = str(uuid.uuid4())
    cancel = threading.Event()
    with _jobs_lock:
        _evict_jobs()
        _jobs[job_id] = {"status": "pending", "created": time.time(), "cancel": cancel}

    def worker():
        token = current_cancel.set(cancel)
        try:
            with _jobs_lock:
                _jobs[job_id]["status"] = "running"
            result = fn(lambda s: _set_stage(job_id, s))
            with _jobs_lock:
                _jobs[job_id].update({"status": "done", "result": result})
        except GenerationCancelled:
            with _jobs_lock:
                _jobs[job_id]["status"] = "cancelled"
        except Exception as e:
            with _jobs_lock:
                # HTTPExceptions carry their message in .detail; everything else in str(e).
                _jobs[job_id].update({"status": "error",
                                      "error": getattr(e, "detail", None) or str(e)})
        finally:
            current_cancel.reset(token)

    threading.Thread(target=worker, daemon=True).start()
    return job_id


def cancel_job(job_id: str) -> bool:
    """Signal a running job to stop. Returns False if the job id is unknown.
    Setting the Event trips the local engine's per-chunk check (or is checked
    before the next AI call), so the generation stops and releases the engine."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        cancel = job.get("cancel") if job else None
    if cancel is None:
        return False
    cancel.set()
    return True


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _clean_slug(slug: str) -> str:
    """Sanitize a slug from the URL path before it touches the filesystem."""
    return re.sub(r"[^a-z0-9\-]", "", slug)


def _tailor_or_502(profile: dict, job_url: str, cfg: dict, lang: str, prompt: str,
                   job_text: str | None = None) -> TailoringPlan:
    """tailor() with fetch/AI failures mapped to clean HTTP errors (surfaced as the
    async job's error), for relang/regenerate."""
    try:
        return tailor(profile, job_url, cfg, lang, prompt, job_text=job_text)
    except AIResponseError as e:
        raise HTTPException(502, str(e))
    except httpx.HTTPError as e:
        raise HTTPException(502, f"Couldn't fetch the job page: {e}")


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
    # None = leave unchanged (older clients). The editor always sends both.
    hidden_sections: list[str] | None = None
    excluded_sections: list[str] | None = None


def _load_plans(row: dict) -> dict[str, dict]:
    """Return {lang: plan_dict} for a history row, migrating from the legacy
    single plan_json column when plans_json isn't populated yet."""
    if row.get("plans_json"):
        return json.loads(row["plans_json"])
    if row.get("plan_json"):
        return {row["lang"]: json.loads(row["plan_json"])}
    return {}


def _persist_plans(history_id: str, lang: str, plans: dict[str, dict]) -> None:
    """Write the per-language plans and mirror the active language into the
    legacy columns (lang/plan_json/summary/tailoring_notes) used by the history
    list and older readers."""
    cur = plans.get(lang, {})
    with db.get_db() as conn:
        conn.execute(
            "UPDATE cv_history SET lang = ?, plans_json = ?, plan_json = ?, "
            "summary = ?, tailoring_notes = ? WHERE id = ?",
            (lang, json.dumps(plans), json.dumps(cur) if cur else None,
             cur.get("summary", ""), cur.get("tailoring_notes", ""), history_id),
        )


@router.get("/templates")
def get_templates() -> dict:
    """Built-in template ids + the shared palette list, for the Settings picker.
    No LLM."""
    return list_templates()


def _render_html(plan: TailoringPlan, profile: dict, lang: str) -> str:
    """Apply tailoring plan and render the CV HTML (current template + profile)."""
    tailored = apply_tailoring(profile, plan)
    design = profile.get("cv_design_preferences", {})
    # The photo is always passed when one exists; per-CV visibility lives in
    # plan.hidden_sections ('photo'), seeded from include_photo at generation
    # time. Gating here on the global flag would make the per-CV toggle a no-op.
    photo_uri = load_photo()
    env = build_env()
    # Groundwork for the template-chooser phase: the template name comes from the
    # profile's design prefs, defaulting to "default"; unknown names fall back.
    name = design.get("template") or "default"
    try:
        template = env.get_template(f"{name}.html")
    except TemplateNotFound:
        template = env.get_template("default.html")
    return template.render(
        **tailored, labels=cv_labels(lang), lang=lang, photo=photo_uri,
        hidden_sections=plan.hidden_sections,
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
            profile = load_profile()
            html = _render_html(plan, profile, lang)
            out_dir = OUTPUT_DIR / slug
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / f"cv_{lang}.html").write_text(html, encoding="utf-8")
            return html
    path = OUTPUT_DIR / slug / f"cv_{lang}.html"
    return path.read_text(encoding="utf-8") if path.exists() else None


def _unique_slug(slug: str) -> str:
    """A slug no existing history row uses. The slug is a CV's whole identity
    (output dir, preview URL, and _current_html's plan lookup), so two rows
    sharing one would silently render each other's edits."""
    with db.get_db() as conn:
        taken = {r["slug"] for r in conn.execute("SELECT slug FROM cv_history").fetchall()}
    if slug not in taken:
        return slug
    n = 2
    while f"{slug}-{n}" in taken:
        n += 1
    return f"{slug}-{n}"


def _run_generation(job_id: str, url: str, lang: str, job_text: str | None = None) -> None:
    with _jobs_lock:
        cancel = _jobs[job_id].get("cancel")
    token = current_cancel.set(cancel) if cancel is not None else None
    try:
        with _jobs_lock:
            _jobs[job_id]["status"] = "running"

        cfg = config.load()
        config.require_engine(cfg)  # fail fast before fetching the job page
        profile = load_profile()
        prompt = cfg.get("cv_prompt") or DEFAULT_CV_PROMPT
        if job_text is None:
            _set_stage(job_id, "fetching")
            job_text = fetch_job_description(url)
        _set_stage(job_id, "thinking")
        plan = tailor(profile, url, cfg, lang, prompt, job_text=job_text)
        # include_photo is the default for NEW CVs only: it seeds the per-CV
        # visibility (hidden_sections), which the editor's photo toggle then
        # owns. Rendering itself never reads the global flag.
        if not profile.get("cv_design_preferences", {}).get("include_photo", False) \
                and "photo" not in plan.hidden_sections:
            plan.hidden_sections.append("photo")
        plan.slug = _unique_slug(plan.slug)
        _set_stage(job_id, "rendering")
        ensure_cv_labels(lang, cfg)  # no-op for reviewed/already-generated languages
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
                    _now(),
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
    except GenerationCancelled:
        with _jobs_lock:
            _jobs[job_id]["status"] = "cancelled"
    except Exception as e:
        with _jobs_lock:
            # HTTPExceptions carry their message in .detail; everything else in str(e).
            _jobs[job_id].update({"status": "error",
                                  "error": getattr(e, "detail", None) or str(e)})
    finally:
        if token is not None:
            current_cancel.reset(token)


def start_generation(url: str, lang: str = "en", job_text: str | None = None) -> str:
    """Kick off async CV generation for a job URL; returns the poll job_id.
    Shared by the /generate endpoint and the Jobs 'accept' flow. Pass job_text
    to reuse the scanner's cached posting and skip a re-scrape."""
    lang = _clean_lang(lang)
    if not is_valid_code(lang):
        raise HTTPException(400, f"Unknown language code '{lang}'.")
    job_id = str(uuid.uuid4())
    with _jobs_lock:
        _evict_jobs()
        _jobs[job_id] = {"status": "pending", "created": time.time(), "cancel": threading.Event()}
    threading.Thread(target=_run_generation, args=(job_id, url, lang, job_text), daemon=True).start()
    return job_id


@router.post("/generate")
def generate_cv(body: GenerateRequest):
    return {"job_id": start_generation(body.url, body.lang)}


class GenericRequest(BaseModel):
    # Omitted ⇒ the app's own language: there's no posting to detect one from,
    # so the language the user reads the app in is the best default.
    lang: str | None = None


def generic_lang(lang: str | None) -> str:
    return lang or config.load().get("app_language") or "en"


def require_ready_profile() -> dict:
    """The generic application's gate: a profile with nothing to aim at can't
    produce a useful untargeted CV or letter. Server-side so the UI's copy of
    this check is only a convenience. Shared with app/api/letters.py."""
    try:
        profile = load_profile()
    except ValueError as e:
        raise HTTPException(400, str(e))
    missing = profile_ready(profile)
    if missing:
        raise HTTPException(400, "Add these to your profile first: " + ", ".join(missing))
    return profile


@router.post("/generic")
def generate_generic_cv(body: GenericRequest):
    """Generate the untargeted CV: same pipeline, with a brief built from the
    profile's preferences standing in for a job posting (no fetch)."""
    profile = require_ready_profile()
    return {"job_id": start_generation(GENERIC_URL, generic_lang(body.lang),
                                       job_text=role_brief(profile))}


class DetectLangRequest(BaseModel):
    url: str


@router.post("/detect-lang")
def detect_lang(body: DetectLangRequest):
    """Detect the language of a job posting so the Applications 'New' slot can
    auto-fill it before generating. One page fetch + one small LLM call."""
    cfg = config.load()
    config.require_engine(cfg)
    return {"lang": detect_language(body.url, cfg)}


@router.get("/status/{job_id}")
def get_job_status(job_id: str):
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Job not found")
    # Strip the internal cancel Event (not JSON-serialisable).
    return {k: v for k, v in job.items() if k != "cancel"}


@router.post("/cancel/{job_id}")
def cancel_generation(job_id: str):
    """Ask a running generation to stop and free the engine (Cancel button)."""
    if not cancel_job(job_id):
        raise HTTPException(404, "Job not found")
    return {"ok": True}


@router.get("/history")
def get_history():
    with db.get_db() as conn:
        rows = conn.execute(
            """SELECT id, slug, job_title, employer, job_url, lang, tailoring_notes, summary,
                      (plan_json IS NOT NULL OR plans_json IS NOT NULL) AS has_plan, created_at
               FROM cv_history ORDER BY created_at DESC"""
        ).fetchall()
    return [dict(r) for r in rows]


@router.delete("/history/{history_id}")
def delete_history(history_id: str):
    with db.get_db() as conn:
        row = conn.execute("SELECT id FROM cv_history WHERE id = ?", (history_id,)).fetchone()
        if not row:
            raise HTTPException(404, "Entry not found")
        conn.execute("DELETE FROM cv_history WHERE id = ?", (history_id,))
    return {"ok": True}


@router.post("/rerender/{history_id}")
def rerender_cv(history_id: str, body: RerenderRequest):
    """Re-render the current-language CV from its stored plan + latest profile
    (cheap, no AI). For plan-less legacy entries, re-tailor from the job URL."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
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
            _persist_plans(history_id, lang, plans)
        plan = TailoringPlan(**plan_data)
        plan.slug = row["slug"]
        profile = load_profile()
        _render_and_save(plan, profile, lang)
    elif row.get("job_url"):
        # No stored plan (older entry) but we have the URL: re-tailor so profile
        # edits are reflected and a plan gets stored for future edits.
        _retailor(history_id, row, lang)
    # else: nothing to do (caller just reloads the iframe)

    return {"ok": True}


def _retailor(history_id: str, row: dict, lang: str, keep_edits: bool = False,
              on_stage=None) -> dict:
    """Re-run AI tailoring from the stored job URL for the given language, save
    the new HTML, and store the plan for that language. Used by relang + regenerate.

    keep_edits: preserve the user's edited summary, role selection and bullets,
    only pulling in the freshly generated bits (e.g. sidebar translations,
    tailoring notes) — so a regenerate can add new content without losing edits.
    on_stage: optional progress callback for the async job pattern."""
    generic = row.get("job_url") == GENERIC_URL
    if not row.get("job_url"):
        raise HTTPException(400, "No job URL stored for this CV, so it can't be regenerated.")

    cfg = config.load()
    try:
        config.require_engine(cfg)
        profile = load_profile()
    except ValueError as e:
        raise HTTPException(400, str(e))
    prompt = cfg.get("cv_prompt") or DEFAULT_CV_PROMPT
    if generic:
        # No posting to fetch: rebuild the brief from the CURRENT profile, so a
        # regenerate picks up preference edits.
        job_text = role_brief(profile)
    else:
        if on_stage:
            on_stage("fetching")
        try:
            job_text = fetch_job_description(row["job_url"])
        except httpx.HTTPError as e:
            raise HTTPException(502, f"Couldn't fetch the job page: {e}")
    if on_stage:
        on_stage("thinking")
    plan = _tailor_or_502(profile, row["job_url"], cfg, lang, prompt, job_text=job_text)
    if on_stage:
        on_stage("rendering")
    ensure_cv_labels(lang, cfg)  # no-op for reviewed/already-generated languages
    plan.slug = row["slug"]  # keep slug so history identity is stable

    plans = _load_plans(row)
    if keep_edits and lang in plans:
        # Overlay the user's edited, visible content on top of the fresh plan;
        # everything else (sidebar_translations, notes, skills) comes in fresh.
        old = plans[lang]
        plan.summary = old.get("summary", plan.summary)
        plan.selected_experience_ids = old.get("selected_experience_ids") or plan.selected_experience_ids
        plan.adjusted_responsibilities = old.get("adjusted_responsibilities") or plan.adjusted_responsibilities
        plan.excluded_sections = old.get("excluded_sections", plan.excluded_sections)
        plan.hidden_sections = old.get("hidden_sections", plan.hidden_sections)
        plan.job_title = old.get("job_title", plan.job_title)
        plan.employer = old.get("employer", plan.employer)

    _render_and_save(plan, profile, lang)
    plans[lang] = asdict(plan)
    _persist_plans(history_id, lang, plans)

    return {"lang": lang, "slug": plan.slug, "summary": plan.summary,
            "tailoring_notes": plan.tailoring_notes,
            "preview_url": f"/api/cv/preview/{plan.slug}/{lang}"}


@router.post("/relang/{history_id}")
def relang_cv(history_id: str, body: RelangRequest):
    """Switch a CV to another language. If a plan for that language already exists
    (incl. your edits), reuse it — no AI call, no lost edits. Otherwise re-tailor.
    Async (job+poll) so the AI path never holds an HTTP request open (C3)."""
    body.lang = _clean_lang(body.lang)
    if not is_valid_code(body.lang):
        raise HTTPException(400, f"Unknown language code '{body.lang}'.")
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    lang = body.lang

    def work(set_stage):
        plans = _load_plans(row)
        if lang in plans:  # reuse the stored plan — cheap, finishes on first poll
            _persist_plans(history_id, lang, plans)
            cur = plans[lang]
            return {"lang": lang, "slug": row["slug"],
                    "summary": cur.get("summary", ""), "tailoring_notes": cur.get("tailoring_notes", ""),
                    "preview_url": f"/api/cv/preview/{row['slug']}/{lang}"}
        return _retailor(history_id, row, lang, on_stage=set_stage)

    return {"job_id": run_async(work)}


class RegenerateRequest(BaseModel):
    keep_edits: bool = False


@router.post("/regenerate/{history_id}")
def regenerate_cv(history_id: str, body: RegenerateRequest):
    """Re-run AI tailoring for the CV's CURRENT language. With keep_edits=True the
    user's summary, role selection and bullets are preserved and only the rest is
    refreshed; otherwise the whole CV is regenerated from scratch. Async (job+poll)."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)
    return {"job_id": run_async(
        lambda set_stage: _retailor(history_id, row, row["lang"],
                                    keep_edits=body.keep_edits, on_stage=set_stage))}


@router.get("/plan/{history_id}")
def get_plan(history_id: str):
    """Return the editable AI-generated content (summary + per-role bullets) for
    the CV's current language, for the in-app editor."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
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
    profile = load_profile()
    # Every role is always shown (the CV never drops history) in the CV's own
    # order — the editor edits the bullets under each, matching apply_tailoring.
    ordered = ordered_experience(profile)
    roles = [{
        "id": e["id"],
        "title": e.get("title", ""),
        "employer": e.get("employer", ""),
        "bullets": plan.adjusted_responsibilities.get(e["id"], e.get("responsibilities", [])),
    } for e in ordered]
    return {
        "lang": lang, "summary": plan.summary, "roles": roles,
        "hidden_sections": plan.hidden_sections,
        "excluded_sections": plan.excluded_sections,
        "highlighted_skills": plan.highlighted_skills,
    }


@router.put("/plan/{history_id}")
def put_plan(history_id: str, body: PlanEdit):
    """Save edits to the AI-generated content for the current language, then
    re-render. Edits are stored per-language so switching language keeps them."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
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
        plan.adjusted_responsibilities[r.id] = r.bullets[:4]  # guard; client caps at 4
    if body.hidden_sections is not None:
        plan.hidden_sections = body.hidden_sections
    if body.excluded_sections is not None:
        plan.excluded_sections = body.excluded_sections
    plans[lang] = asdict(plan)
    _persist_plans(history_id, lang, plans)

    profile = load_profile()
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


@router.post("/summary/{history_id}/generate")
def generate_cv_summary(history_id: str):
    """Regenerate just the professional summary via AI, patch the HTML, update DB.
    Async (job+poll) so a slow local engine never times out the request (C3)."""
    with db.get_db() as conn:
        row = conn.execute("SELECT * FROM cv_history WHERE id = ?", (history_id,)).fetchone()
    if not row:
        raise HTTPException(404, "Entry not found")
    row = dict(row)

    cfg = config.load()
    try:
        config.require_engine(cfg)  # fail fast before launching the thread
        load_profile()
    except ValueError as e:
        raise HTTPException(400, str(e))

    def work(set_stage):
        profile = load_profile()
        lang = row["lang"]
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

        set_stage("thinking")
        try:
            response = complete(
                [
                    {
                        "role": "system",
                        "content": (
                            f"You are an expert career coach. Write a professional CV summary in {lang_name(lang)}.\n"
                            "Rules: first person (I, my), maximum 4 sentences, direct and specific to the role.\n\n"
                            f"CANDIDATE PROFILE:\n{json.dumps(profile_for_tailoring(profile), ensure_ascii=False, indent=2)}"
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"Write a professional summary for this application:\n\n{job_context}",
                    },
                ],
                cfg=cfg,
                max_tokens=512,
            )
            new_summary = message_text(response)
        except AIResponseError as e:
            raise HTTPException(502, str(e))

        set_stage("rendering")
        if plan_data:
            plan_data["summary"] = new_summary
            plans[lang] = plan_data
            _persist_plans(history_id, lang, plans)
            plan = TailoringPlan(**plan_data)
            plan.slug = row["slug"]
            _render_and_save(plan, profile, lang)
        else:
            with db.get_db() as conn:
                conn.execute("UPDATE cv_history SET summary = ? WHERE id = ?", (new_summary, history_id))
        return {"summary": new_summary}

    return {"job_id": run_async(work)}


@router.get("/preview/{slug}", response_class=HTMLResponse)
def preview_cv(slug: str, autoprint: bool = Query(False, alias="print")):
    slug = _clean_slug(slug)
    # Prefer English, then any language a CV was generated in for this slug.
    langs = ["en"] + sorted(
        p.stem.removeprefix("cv_")
        for p in (OUTPUT_DIR / slug).glob("cv_*.html")
    ) if (OUTPUT_DIR / slug).exists() else ["en"]
    for lang in dict.fromkeys(langs):  # de-dupe, keep order
        html = _current_html(slug, lang)
        if html is not None:
            return HTMLResponse(_maybe_print(html, autoprint))
    raise HTTPException(404, "CV not found")


@router.get("/preview/{slug}/{lang}", response_class=HTMLResponse)
def preview_cv_lang(slug: str, lang: str, autoprint: bool = Query(False, alias="print")):
    slug = _clean_slug(slug)
    lang = _clean_lang(lang)
    if not is_valid_code(lang):
        raise HTTPException(400, "Unknown language code")
    html = _current_html(slug, lang)
    if html is None:
        raise HTTPException(404, "CV not found")
    return HTMLResponse(_maybe_print(html, autoprint))


@router.get("/pdf/{slug}/{lang}")
def pdf_cv(slug: str, lang: str):
    """Render the CV to a real PDF (headless Chromium) and return as a download."""
    from app.services.pdf import html_to_pdf

    slug = _clean_slug(slug)
    lang = _clean_lang(lang)
    if not is_valid_code(lang):
        raise HTTPException(400, "Unknown language code")
    html = _current_html(slug, lang)
    if html is None:
        raise HTTPException(404, "CV not found")
    pdf = html_to_pdf(html)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="cv_{slug}_{lang}.pdf"'},
    )
