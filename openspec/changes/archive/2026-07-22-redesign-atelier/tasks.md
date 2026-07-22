## 1. Source of truth (docs first, so the impeccable detector agrees)

- [x] 1.1 Rewrite DESIGN.md: overview/North Star (the drenched Stone world replaces the cream-sheet-on-dark-wall), Colors (retire cream/vermilion/teal ramp; add the sage `ground`/`board`/`surface` ramp, deep-pine `--ink`/`--heading`/`--muted`, terracotta `--accent`/`--accent-hover`/`--accent-soft`/`--accent-text` (fill vs. text split, with the AA rationale), pine `--mark`, `--deadline`=`--accent-text`; document Fern/Meadow as sanctioned nudges, Stone default), corner scale (pill controls + `--r-panel`/`--r-frame`, drop "don't round any corner"), depth (tonal steps + hairline, no card shadow; one soft float shadow for overlays only), borders (`--line` ink 16%; no side-stripes), listings (one tonal board split by hairlines, no cards), badges (meta/status are text; Badge reserved for categorical labels), typography (mixed-case weight-based headings, system-sans body + mono data voice, drop blanket uppercase), and Do/Don't — keep accent rationing + all contrast thresholds
- [x] 1.2 Update DESIGN.md front-matter tokens (palette hexes, radius scale, fonts) to the locked Stone values
- [x] 1.3 Reconcile PRODUCT.md anti-references: redefine "not generic SaaS" as the drenched Stone ground + rationed terracotta + calm register (not the absence of radius/depth, and not the old cream/Bauhaus system); keep the job-board and chat-bot anti-references; add cards/cream/soft-shadow/side-stripe/glass/pill-badge to the explicit slop list
- [x] 1.4 Update CLAUDE.md "Why the Bauhaus/Swiss poster style?" design-decision note so it describes the Atelier / Stone system (drenched ground, one tonal board, tonal depth, de-badged, pill/rounded, system-sans × mono) instead of cream/zero-radius/hard-shadow print

## 2. Token layer

- [x] 2.1 `index.css`: replace the palette tokens with the Stone set (`--ground`/`--board`/`--surface`/`--ink`/`--heading`/`--muted`/`--accent`/`--accent-hover`/`--accent-ink`/`--accent-text` `#963618`/`--accent-soft`/`--mark`/`--deadline`=`--accent-text`/`--line`); use `--accent` only as a fill and `--accent-text` for any terracotta text (CTA link, deadline); retire `--paper` (as a cream sheet), `--frame`, the teal ramp, and `--shadow-pop`/`--shadow-pop-wall`
- [x] 2.2 `index.css`: add the radius scale tokens (`--r-btn`/`--r-field`/`--r-nav` `999px`, `--r-panel` `22px`, `--r-frame` `30px`) and remove the "everything is 0" defaults; add a single soft `--shadow-float` for overlays
- [x] 2.3 `index.css`: set the data/mono voice — `--data-font` (mono) applied to meta, counts, dates, page-sub, the match marker; keep the system-sans body stack; drop the global `text-transform: uppercase` on headings (keep it only on the mono match word + small utility labels)
- [x] 2.4 `App.css`: sidebar = tonal step of the ground (`color-mix(--ink 8%, --ground)`), content sits directly on `--ground` (remove the floating `.page-container` sheet + dark wall), active nav = `--board` fill pill (`--r-nav`, `--heading` text, no accent, no side-stripe)

## 3. Shared primitives & components

- [x] 3.1 Buttons: primary (terracotta)/secondary (hairline)/ghost/danger use `--r-btn` pills with the full state set (default/hover/active/focus-visible ring/disabled); no button shadow
- [x] 3.2 Listings/board: the suggestions/filtered/history lists become one `--board` panel (`--r-panel`) with hairline-divided rows (last row none); remove per-card border + shadow + any side-stripe
- [x] 3.3 De-badge: the listing meta becomes an inline mono line (middot separators), match becomes marker + `--mark` word, deadline becomes `--deadline` mono text; change the Badge usages that restate a row's fields, keeping Badge only for categorical labels (section destination, language level)
- [x] 3.4 Inputs/`select`/`textarea`: `--r-field` pill (or `--r-panel` for multiline), `--surface` fill, `--line` border, accent focus ring; keep `:focus-visible` outline for a11y
- [x] 3.5 `.callout` + `.empty-state`: `--r-panel`, tonal accent tint (`color-mix(--accent 10%, --board)`), no shadow
- [x] 3.6 Modal/menu/toast: `--r-panel`/`--r-btn` + the single `--shadow-float` (the one sanctioned soft shadow)
- [x] 3.7 Grep the frontend for hard-coded `border-radius: 0`/`2px`, `box-shadow` offsets, `border-left`/`border-right` accents, and the retired hexes (cream, vermilion, `#1E3A38`, teal) that bypass the new tokens; route each through a token or remove

## 4. Per-page visual audit

- [x] 4.1 Profile + Preferences: sections, section badges (categorical — keep), `.seg`, star rating, add-section menu inherit the new tokens; fix any square/carded islands and any cream/vermilion leftovers
- [x] 4.2 Jobs (Job Suggestions): board rows, de-badged meta/match/deadline, filtered-out collapsible, scan-status strip, search/source filter match the resolved reference
- [x] 4.3 Applications: CVEditor + GuideView panels, the CV|Letter `.seg` tabs, LangSelect, generic-application create card
- [x] 4.4 Settings + Onboarding: engine/model rows, template-thumbnail grid, photo-crop modal, first-run wizard steps

## 5. Verification

- [x] 5.1 Update `scripts/check_contrast.mjs` for the Stone shell tokens (sidebar sage, `--muted` on `--ground` and on `--board`, `--mark` on `--ground`/`--board`, **`--accent-text` and `--deadline` as text on `--ground` and `--board`** — the pairs that actually fail if the fill value leaks into text — white-on-`--accent` fill, footer + AGPL link on the ground), re-run it, and fix any AA regression
- [x] 5.2 Screenshot pass (via the app-run tooling) of Jobs, Applications, Profile, Settings against the resolved Atelier / Stone reference; correct drift
- [x] 5.3 Run `/impeccable audit` on the changed frontend files; resolve real findings, classify false positives
- [x] 5.4 `uv run pytest` + `cd frontend && npm run build` green
- [x] 5.5 Update README.md if the redesign changes anything about how the app is run or described (screenshots/description); otherwise note no change
