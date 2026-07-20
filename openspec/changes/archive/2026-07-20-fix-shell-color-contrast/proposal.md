## Why

The app shell fails the WCAG AA baseline PRODUCT.md commits to. `--frame`
(`#6B8F91`) is a mid-tone: at L≈58% it can hold neither ink nor paper text, so
every label on it falls short — nav links **2.58:1**, footer **2.27:1**, the
AGPL §13 source link **3.06:1**, and the vermilion active-tab stripe **1.42:1**
against a 3:1 requirement. No text-color tweak escapes this; even pure `#FFFFFF`
on that ground reaches only 3.52:1. Every colour on the cream sheet was audited
and commented with measured ratios; the wall it hangs on never was.

Two related defects share the same root. The system carries **two unrelated
teals** (`--frame` shell, `--teal` content) whose only relationship is that they
rhyme — DESIGN.md has to ship a warning label telling authors to keep `--frame`
out of in-page UI. And `index.css:96` colours every `<a>` in the app
`--accent-text`, putting 25+ vermilion elements on a populated Job Suggestions
page where DESIGN.md's Rationed Accent Rule permits one.

Source: `/impeccable critique` snapshot
`.impeccable/critique/2026-07-20T18-26-57Z__frontend-src-index-css.md` (31/40).

## What Changes

- **`--frame` becomes a deep teal `#1E3A38`.** Nav rises to 6.74:1, footer to
  7.44:1, the AGPL link to 10.62:1 — all clearing AA with the active cream tab
  still winning decisively at 15.09:1.
- **The two teals collapse into one three-value ramp** — `#1E3A38` (wall) /
  `#2F6B66` (AI+success) / `#DDEAE7` (tint) — one hue, three jobs. The
  keep-it-out-of-the-UI warning in DESIGN.md is deleted rather than reworded.
- **A wall-specific offset shadow** (`--shadow-pop-wall`, `6px 6px 0 #0D1918`).
  The existing ink-at-18% shadow computes to 1.08:1 on a dark wall — invisible.
  The new value restores the print gesture at 1.47:1, matching the perceptual
  weight the modal shadow has on cream today.
- **The wordmark's `em` stops being `--ink`.** "JOB **COACH**" renders its second
  word in ink, which only works on a light wall; on a dark one it vanishes
  (verified by screenshot). It becomes `--accent` — a legitimate rationed-accent
  use.
- **The vermilion active-tab stripe is removed.** At 2.45:1 it still misses the
  3:1 UI threshold on the new wall, and it is redundant: the cream tab already
  carries "you are here" at 15.09:1. Removing it returns a rationed accent.
- **In-content links become `--ink` with a 1px underline** at `ink 45%`.
  `--accent-text` is reserved for links that *are* the next action. This takes
  the Jobs page from 25+ vermilion elements to three: primary button, active
  tab, deadline chip.
- Nav hover flips from `ink 14%` to `paper 10%` (correct polarity on a dark
  ground).

Not in scope: the onboarding-wizard rework, card-in-card tone step-down, and the
DESIGN.md disabled-contrast correction — all separate findings in the same
snapshot.

## Capabilities

### New Capabilities
- `app-shell-visual-system`: the shell's colour contract — wall/sheet
  relationship, the teal ramp, shell text and nav state legibility, elevation on
  the wall, and where the rationed accent may and may not be spent.

### Modified Capabilities

None. No existing spec states requirements about shell colour or link styling.

## Impact

- `frontend/src/index.css` — `--frame`, `--teal*` ramp comments, `--shadow-pop-wall`, the `a {}` rule
- `frontend/src/App.css` — `.sidebar-nav` link/hover/active, `.nav-logo em`, `.app-footer`, `.page-container` shadow
- `DESIGN.md` — Colors §2 (ramp replaces the two-teal split + warning label), Elevation §4 (second shadow token), Do's and Don'ts (link-colour rule)
- No API, backend, data-format, or i18n changes. No new dependencies.
- Phase: cross-cutting UI correctness on Phase 4–5 surfaces, not a new phase.
