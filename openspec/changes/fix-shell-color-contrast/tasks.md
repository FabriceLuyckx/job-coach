## 1. Groundwork

- [x] 1.1 Grep `--frame` across `frontend/src/` and confirm every use is shell chrome (sidebar, body, footer); list any in-page use as a defect to fix in 2.x rather than leaving it on a re-valued token
- [x] 1.2 Add `scripts/check_contrast.mjs` — a standalone node script that parses the token values out of `frontend/src/index.css` and `frontend/src/App.css`, computes sRGB relative-luminance contrast ratios, and exits non-zero if any shell pair falls below its threshold (nav inactive/hover/active, wordmark incl. `em`, footer text, AGPL link ≥4.5:1; page-sheet shadow vs wall ≥1.2:1)
- [x] 1.3 Run `check_contrast.mjs` against the current unmodified tree and confirm it **fails** on the five known pairs — a checker that passes before the fix is not checking anything

## 2. Token and shell changes

- [x] 2.1 In `index.css`, set `--frame: #1E3A38` and restate the teal tokens as one documented three-value ramp (wall / content `#2F6B66` / tint `#DDEAE7`), with measured ratios in comments matching the existing convention at `index.css:21-24`
- [x] 2.2 Add `--shadow-pop-wall: 6px 6px 0 #0D1918` beside `--shadow-pop`, commented with which ground each belongs to
- [x] 2.3 In `App.css`, set `.page-container` to `box-shadow: var(--shadow-pop-wall)`
- [x] 2.4 In `App.css`, set `.sidebar-nav a` colour to `color-mix(in srgb, var(--paper) 75%, transparent)` and flip `:hover` background from `ink 14%` to `color-mix(in srgb, var(--paper) 10%, transparent)`
- [x] 2.5 In `App.css`, remove the `border-left: 3px solid transparent` / `border-left-color: var(--accent)` pair from `.sidebar-nav a` / `.active`, keeping the cream-fill + ink-text active treatment; verify no layout shift from the lost 3px (adjust padding if the row reflows)
- [x] 2.6 In `App.css`, change `.nav-logo em` from `var(--ink)` to `var(--accent)`
- [x] 2.7 In `App.css`, set `.app-footer` colour to `color-mix(in srgb, var(--paper) 80%, transparent)`; leave `.app-footer a` at full `--paper`
- [x] 2.8 Fix any in-page `--frame` use found in 1.1

## 3. Accent rationing

- [x] 3.1 In `index.css`, change the global `a` rule from `color: var(--accent-text)` to `color: var(--ink)` with `text-decoration: underline` and `text-decoration-color: color-mix(in srgb, var(--ink) 45%, transparent)`; drop the now-redundant `a:hover` underline and give hover a stronger `text-decoration-color` instead
- [x] 3.2 Audit call sites that relied on the old global accent link and restore `--accent-text` explicitly where the link *is* the view's next action (Preferences end-card link, `.callout-highlight a`); confirm `a.btn-primary` and `.app-footer a` still override correctly
- [x] 3.3 Grep `pages/` and `components/` for links whose only affordance was the accent colour (no underline, no icon) and confirm each now renders an underline

## 4. Verification

- [x] 4.1 Run `check_contrast.mjs` and confirm it now **passes** every pair
- [x] 4.2 Run `npm run build` in `frontend/` and confirm a clean production build (the spike used injected CSS; the built output is what ships)
- [x] 4.3 Screenshot `/profile`, `/applications`, `/jobs`, `/settings` against the built app via Playwright and confirm: wordmark fully legible incl. "COACH", active nav route unambiguous without the stripe, page-sheet shadow visible on the wall, and no content link still rendering vermilion
- [x] 4.4 Count vermilion elements on a populated `/jobs` screenshot and confirm the total is the primary button, active tab, and deadline chips only
- [x] 4.5 Run `uv run pytest` and confirm no regressions

## 5. Documentation

- [x] 5.1 Update `DESIGN.md` §2 Colors: replace the two-teal split with the three-value ramp, delete the "keep it out of in-page UI" warning on the shell colour, and record the new shell ratios
- [x] 5.2 Update `DESIGN.md` §4 Elevation for the second shadow token, and §6 Do's and Don'ts with the link-colour rule (ink + underline; accent reserved for the primary next action)
- [x] 5.3 Update `DESIGN.md` §5 Navigation: the active item is a cream tab with no accent border
- [x] 5.4 Update the "Why the Bauhaus/Swiss poster style?" paragraph in `CLAUDE.md`, which currently describes the shell as "a muted teal wall"
- [x] 5.5 Confirm no `README.md` change is needed (no setup, CLI, or usage surface is affected) and state that explicitly in the change summary
