## Why

The job filter (Phase 5/6) judges each opening against the static profile only.
It ignores the user's actual decisions — accepting one posting and rejecting
another teaches it nothing, so it keeps surfacing the same kind of mismatch. The
richest signal for "what this person wants" is the accept/reject history the user
already produces, plus the reason they reject. Capturing and reusing that closes
the loop cheaply. This belongs to Phase 6 (Job Matching & Filtering).

## What Changes

- On **Reject**, open a modal with an **optional** free-text explanation ("why
  are you rejecting this?"). Submitting with an empty note behaves exactly like
  today's one-click reject. **Accept stays one-click** — no modal.
- Persist the explanation on the opening in a **new `user_note` column**, kept
  separate from the LLM's audit `reason`. Rejecting from History also offers it.
- Maintain a single compact **"learned preferences" memo** — the LLM distils the
  user's *entire* accept/reject history (titles + the user's reject notes) into a
  short, deduplicated summary of what they tend to want and avoid. The memo is
  **rebuilt lazily, at most once per scan, and only when decisions have changed**
  since it was last built (cached otherwise) — so rejecting stays instant and no
  LLM call happens on the reject action itself.
- The per-posting review (`review_posting` in `job_scanner.py`) injects this one
  memo as untrusted context, so the verdict reflects the full decision history
  without the token cost growing as that history grows.

## Capabilities

### New Capabilities
- `job-feedback-learning`: capture an optional reject explanation, distil the
  full accept/reject history into a compact learned-preferences memo (rebuilt on
  change), and inject that memo into the opening-review prompt so the filter
  adapts to the user's real choices at bounded token cost.

### Modified Capabilities
<!-- None: the reject-with-note action and history-aware verdict are new concerns,
     not changes to an existing requirement in openspec/specs/job-scan-lifecycle. -->


## Impact

- **DB**: `job_openings` gains `user_note TEXT` (new migration in `app/db.py`).
- **Backend**: `POST /api/jobs/openings/{id}/reject` accepts optional `{note}`;
  a `build_preference_memo()` helper (re)builds the memo from decisions when a
  cheap signature (decision count + latest `decided_at`) changes, caching it in
  `config.json`; `review_posting()` / `_review_one()` take the memo block.
  `_run_scan`, `_run_recheck`, and `/check` all resolve the memo once and pass it down.
- **Frontend**: `Jobs.tsx` reject → shared `Modal` with an optional textarea;
  `api.ts` reject signature gains an optional note. New `en.json` keys.
- **Tests**: history is bounded and shaped correctly; reject persists the note;
  empty note = plain reject.
- No new dependencies. Scraped/user text stays untrusted (forced tool schema).
