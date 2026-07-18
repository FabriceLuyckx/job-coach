## Why

An `/impeccable critique` of the Job Suggestions page scored it **27/40**. The
page's engineering is strong — resumable, cancellable scans that never re-pay
for stored work, and a filtered-out audit trail almost no product ships — but
its *visual* language contradicts its own *verbal* promises at two points.
The AI's reason for dismissing a job is rendered at `opacity: 0.55`, roughly
**2.4:1** contrast: the justification for a rejection is the least legible text
on the page, failing the WCAG AA baseline PRODUCT.md commits to. And the entire
appeals apparatus is hidden until something has already been filtered, so on
first run — exactly when trust is being decided — the user sees a filter with
no visible way to argue with it.

## What Changes

- **Filter decisions stay legible.** Remove the `opacity` fades on filtered-out
  and rejected rows; signal "decided" structurally (a `--surface-dim` fill plus
  the existing verdict icon and text label) instead of by dimming.
- **The appeal path is discoverable before it is needed** — the page explains
  that non-matches are kept with their reason and can be restored, even when
  nothing has been filtered yet.
- **Accepting stays in place.** Accept no longer force-navigates to
  Applications; the row marks accepted inline with a link through and an Undo
  in the toast, so a queue can be triaged in one pass. **BREAKING** for anyone
  relying on the automatic redirect (not currently spec'd).
- **One rationed accent.** Accept drops to `secondary`, so vermilion stops
  repeating once per suggestion card and again marks a single next action.
- **Scan status gets one home** — a `role="status"` strip owning scan/re-check
  progress, source errors, and Cancel, instead of progress living inside the
  label of the button that started it.
- **Real page semantics** — region titles become `<h2>`, and both URL inputs
  become typed/validated and visually distinguishable.
- **Two bugs:** Cancel vanishing when a re-check empties the filtered list, and
  per-source errors colliding because they are keyed by hostname-derived name.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `job-scan-lifecycle`: adds requirements for filter-decision legibility, a
  discoverable appeal path, accept-in-place with undo, a single announced
  status region, navigable page semantics, and correct per-source error
  attribution; modifies the cancellable-scan and accept-copy requirements.

## Impact

- `frontend/src/pages/Jobs.tsx` (543 lines) — the whole surface.
- `frontend/src/index.css` — a decided/deprioritised row treatment.
- `frontend/src/locales/en.json` — new and changed copy (English source only;
  the pre-commit hook translates shipped locales).
- Phase 5 (Job Suggestions), per CLAUDE.md.
