## Context

`review_posting()` (`app/services/job_scanner.py`) makes one forced-tool
`complete()` call per opening, judging the posting text against a hand-picked
slice of the profile (`preferences`, `summary`, `skills`, `professional_title`).
Verdicts and the LLM's `reason` are stored on `job_openings`; accept/reject only
flips `status` + `decided_at`. Nothing carries the user's own reasoning, and no
past decision influences a future verdict. The scan's cost design (link-hash
skip, review-once-per-opening) must be preserved.

## Goals / Non-Goals

**Goals:**
- Capture an optional, free-text reason when the user rejects an opening.
- Make the per-posting verdict reflect the user's *entire* real accept/reject
  history, compacted so token cost does not grow with it.
- Keep the reject action instant (no LLM call on click) and keep the
  unchanged-source zero-LLM scan path.

**Non-Goals:**
- No scoring model, embeddings, or fine-tuning — a natural-language memo the LLM
  maintains, injected as in-context guidance.
- No modal or extra friction on Accept.
- No retroactive re-judging of already-decided openings (recheck already exists
  for `seen` rows and will pick up the memo for free).

## Decisions

**1. New `user_note TEXT` column, not overloading `reason`.**
`reason` is the LLM's audit trail (shown in the UI, kept even for non-matches).
The user's rejection reason is different data with a different author; a separate
column keeps both auditable and lets the prompt label them distinctly. Migration
added to `app/db.py` alongside the existing `available` migration (ALTER TABLE …
ADD COLUMN, idempotent via the existing column-check pattern).

**2. A learned-preferences memo, rebuilt on change — not a per-decision list.**
Rather than pasting the last N decisions into every review (cost grows with
history, and the user asked for *all* history), the LLM maintains one compact
memo: a short natural-language summary of what the user tends to accept and
reject, deduplicated across the whole history. `build_preference_memo()` in
`job_scanner.py` reads every decided opening (accepted `{title, reason}` +
rejected `{title, user_note or reason}`) and makes one `complete()` call that
distils them into a capped memo (target ~1200–1500 chars, forced-tool or plain).

- **Rebuild-on-change, cached.** Storing the memo is cheap; rebuilding it every
  scan is not. Cache the memo in `config.json` (`job_preference_memo`) with a
  signature (`job_preference_memo_sig` = decision count + latest `decided_at`).
  `ensure_preference_memo()` rebuilds only when the signature changes; otherwise
  it returns the cached text. So the memo costs **one** LLM call the first scan
  after any new decision, and **zero** when nothing was decided since.
- **Why not fold per decision?** Updating the memo on each accept/reject would
  add an LLM call to the reject click (today instant) and to accept (already
  async). Rebuilding at scan start instead keeps the action instant and amortises
  the cost to once per scan. The raw `user_note`/`reason` rows stay the source of
  truth, so the memo is always rebuildable and never the only copy.

**3. The memo goes in as clearly-labelled, untrusted context.**
Injected as a single "The user's learned preferences from past decisions" block
appended to the review user-message, never the system prompt, tool schema stays
forced (`tool_choice`) — scraped or user-entered text can never select an action
beyond the constrained verdict schema (CLAUDE.md §untrusted content). No
decisions yet ⇒ empty memo ⇒ block omitted (first-run behaves as today).

**4. Reject modal reuses the shared `Modal` + a `textarea`.**
`Jobs.tsx` reject handler opens `Modal` with an optional textarea and
Reject/Cancel actions; submit calls `rejectOpening(id, note)`. Empty note sends
no note → identical to today. Accept is untouched. The Undo toast still restores.

## Risks / Trade-offs

- **Prompt injection via user_note / posting text** → the memo-build and the
  review both use forced tool schemas and label the text as user-supplied; it can
  only tilt a verdict, not issue instructions. Same posture as scraped-text today.
- **Memo drift / the compaction LLM mangles it** → the memo is derived, never the
  only copy; raw decisions stay in the DB and the memo is rebuilt from scratch
  each time the signature changes (no lossy fold-on-fold accumulation). Length is
  capped in the build prompt.
- **Token cost** → review injects one bounded memo (O(1) in history size); the
  rebuild is one LLM call, only when decisions changed, at most once per scan.
- **Cold start (no decisions yet)** → memo empty, block omitted; unchanged.
- **Stale/again-relevant preferences** → the memo is advisory context, not a hard
  rule; the profile and posting still drive the verdict, and it self-corrects as
  new decisions re-shape the next rebuild.

## Migration Plan

Additive `user_note` column with default NULL — no backfill, no rollback data
loss. Old rows have `user_note = NULL` (treated as "no note"). The memo cache
lives in `config.json`; absent keys just mean "rebuild on next scan". `POST
/api/backup/import` re-runs `init_db()` and merges config, so a restored DB
migrates and its memo rebuilds from the restored decisions on the next scan.
