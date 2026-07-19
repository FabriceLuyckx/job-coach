## 1. Backend — brief + readiness

- [x] 1.1 Add `GENERIC_URL = "generic:profile"`, `role_brief(profile) -> str` and `profile_ready(profile) -> list[str]` to `app/services/cv_renderer.py`
- [x] 1.2 `role_brief` renders target roles, looking_for, locations, remote, languages, notes and professional_title as posting-shaped plain text; tolerates missing keys
- [x] 1.3 Add a `tests/` case pinning brief content for a full profile and for a minimal one, and `profile_ready` returning the missing keys

## 2. Backend — generation paths

- [x] 2.1 `POST /api/cv/generic {lang}` in `app/api/cv.py`: enforce `profile_ready` (400 with missing keys), then `start_generation(GENERIC_URL, lang, job_text=role_brief(profile))`
- [x] 2.2 Guard `_retailor`: for `GENERIC_URL` use `role_brief(load_profile())` instead of `fetch_job_description`, and skip the "No job URL stored" 400 — covers relang and regenerate
- [x] 2.3 `POST /api/letters/generic {lang}` in `app/api/letters.py`: same readiness gate, then `start_letter_generation` with the sentinel
- [x] 2.4 `_cached_posting_text` (or its caller) returns the role brief for `GENERIC_URL` so the guide is never fetched
- [x] 2.5 Test: generating and re-tailoring the generic application performs no HTTP fetch (mock/assert `fetch_job_description` is not called) and the unready profile is rejected

## 3. Frontend — API + model

- [x] 3.1 Add `generateGenericCV(lang)` / `generateGenericLetter(lang)` to `frontend/src/api.ts`
- [x] 3.2 Export the sentinel and a `profileReady(profile)` helper (mirroring the server) for the frontend
- [x] 3.3 `mergeApplications` splits the sentinel row out into a separate `generic` application instead of the sorted list

## 4. Frontend — Applications page

- [x] 4.1 Render the generic slot above the list: existing `ApplicationRow` with `generic` presentation (generic title, no listing link, no external URL affordance)
- [x] 4.2 When absent and the profile is ready: a pinned create card explaining what it is, with the create action, progress and Cancel (reuse `makeCanceller`)
- [x] 4.3 When absent and the profile is not ready: name the missing pieces and link to Preferences (target roles) / Profile (experience); no create button
- [x] 4.4 Exclude the generic application from the search filter and from date sorting
- [x] 4.5 Language control, CV editor, letter tab, delete + undo all work on the generic row (no `app.jobUrl` gating for the sentinel)
- [x] 4.6 Add the new strings to `frontend/src/locales/en.json` only (never run `translate_locales.py`)

## 5. Docs & verification

- [x] 5.1 Update `CLAUDE.md` (Applications page description + endpoint list) and `README.md` if usage changes
- [x] 5.2 `uv run pytest` and the frontend typecheck/build pass
- [x] 5.3 Run `/impeccable critique` on the changed Applications surface and apply purely presentational findings
