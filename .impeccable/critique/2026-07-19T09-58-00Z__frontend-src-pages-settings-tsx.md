---
target: Settings
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-19T09-58-00Z
slug: frontend-src-pages-settings-tsx
---
Method: dual-agent (A: design review · B: detector + static evidence). Browser overlay unavailable — no browser automation tool exposed; Assessment B substituted computed contrast + static a11y analysis.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Selected AI engine has no visual fill — `--accent-wash` undefined; selected/unselected differ only by border colour |
| 2 | Match System / Real World | 2 | "OpenRouter", "provider/model-name", 8 raw model IDs, four raw prompt textareas, for non-technical users |
| 3 | User Control and Freedom | 2 | Three `window.confirm`s guard the only destructive actions; no undo, unlike Profile/Preferences |
| 4 | Consistency and Standards | 1 | Three save models inside one card; `div.section-title` vs real `<h2>` elsewhere; native confirms despite a Modal primitive; a hardcoded English string |
| 5 | Error Prevention | 3 | HEX_RE, `{lang_name}` validation, RAM pre-check good; no preview before full-replace restore |
| 6 | Recognition Rather Than Recall | 3 | Template thumbs/palette swatches excellent; model dropdown pure recall |
| 7 | Flexibility and Efficiency | 4 | Custom model, custom palette, editable prompts, wheel-zoom crop |
| 8 | Aesthetic and Minimalist | 2 | Six undifferentiated cards, no grouping, no priority order |
| 9 | Error Recovery | 3 | errMsg + toasts consistent; "Balance unavailable" collapses every cause |
| 10 | Help and Documentation | 3 | Real plain-spoken help text; nothing beyond it |
| **Total** | | **26/40** | **Acceptable — significant improvements needed** |

## Anti-Patterns Verdict

Not AI slop, but the page where the system's own discipline lapsed. Custom work is real (TemplateThumb, lossless crop, credit line); composition is the lazy answer DESIGN.md warns about — six identical `.card` divs in load order, not importance order. AI Engine + OpenRouter are one decision in two cards; Photo + Visual Preferences one concern in two more.

DESIGN.md rules broken: Rationed Accent (~10 simultaneous vermilion signals); "don't round any corner" (`borderRadius: 4` EngineSettings.tsx:132, `borderRadius: 1` TemplateThumb.tsx:15); "ink fill = chosen/active" (selected engine card has no fill). One Ink Rule and Flat-At-Rest hold cleanly.

Deterministic scan: `detect.mjs` exit 2, one finding — `layout-transition` at EngineSettings.tsx:133 (`transition: width .3s` on the download bar). True but trivial. Zero findings in Settings.tsx and the other three components.

Contrast: all declared pairs pass. `--muted` on `--surface` 5.82:1, on `--surface-dim` 4.96:1, mustard unsaved-dot 5.92:1, accent link 4.77:1. No contrast issue on this page.

Visual overlays: none — no browser automation tool exposed.

## Overall Impression

The components are better than the page. TemplateThumb and PhotoCropModal are work nobody generates by default; they sit in a container expressing no priority — UI language first, irreversible restore fifth behind a bare OS dialog. Biggest opportunity: structure and semantics. Six real `<h2>`s and a priority order cost almost nothing and fix the worst failures at once.

## What's Working

1. TemplateThumb — five layouts as React divs, recoloured live from the unsaved palette. No assets, no screenshots to go stale, crisp at any DPI.
2. PhotoCropModal stores parameters, never re-encodes — lossless, re-editable, WYSIWYG by construction (transform copied from `photo_frame()`).
3. The credit line enacts "honest about cost" — balance and spend beside the key that spends them, only once a key is set.
4. The AI Engine card's copy is the best emotional moment in the app — honest about cost, zero pressure.

## Priority Issues

### [P0] Six section headings are `<div>`s
Settings.tsx:296, 357, 432, 528 + EngineSettings.tsx:94 + LanguageSettings.tsx:79 use `div.section-title`; Collapsible gets no `headingLevel`; PromptEditor titles are styled divs. One `<h1>`, zero `<h2>`s on the app's longest page.
Why: screen-reader users navigate settings by heading. Profile (ProfileSection.tsx:26) and Preferences already do this right; Settings missed the fix.
Fix: six divs → `<h2 className="section-title">`, `headingLevel={2}` on the Collapsible, `<h3>` for PromptEditor. Zero visual change — index.css:87 already styles h2/h3.
Command: /impeccable audit

### [P1] Engine choice has no reliable state, and isn't a radiogroup
EngineSettings.tsx:161 uses `var(--accent-wash, var(--surface))`; `--accent-wash` is defined nowhere. Selected/unselected backgrounds identical; 2px border is the sole cue. Cards are `aria-pressed` toggles for a mutually exclusive choice — same for palette swatches (:474) and template grid (:444).
Why: colour-only state fails WCAG 1.4.1 on the app's most consequential setting. Commit 36b365b already fixed this exact pattern on Preferences.
Fix: reuse the `Segmented` radiogroup from Preferences.tsx:38; delete `--accent-wash`; give the selected card ink fill + cream text.
Command: /impeccable audit

### [P1] Three save models inside one card
Visual Preferences: template/palette/colours need SaveButton (:520); `include_photo` autosaves (:191); `photo_crop` saves on modal confirm (:204) — all writing the same object in the same file. `prefsSnapshot` (:38) exists purely to exclude include_photo from the dirty check. Profile and Preferences autosave this same file with no Save buttons.
Why: user must infer per-control whether a change is committed; navigating away loses the palette silently, no beforeunload guard.
Fix: autosave via `useProfileAutosave`; delete SaveButton, prefsSnapshot, savedPrefs, prefsDirty.
Command: /impeccable polish

### [P2] Vermilion spent ~10× on one screen
`Export backup (.zip)` has no variant → renders primary, loudest element on the page (:533). "Downloaded and ready" uses `--accent-text` (EngineSettings.tsx:123) for a success state DESIGN.md assigns to teal.
Fix: SaveButtons → secondary (the mustard unsaved dot is already the signal); Export → secondary; ready state → `--success`; progress bar → `--ink`. Leaves vermilion for selected-engine, selected-template, focus ring.
Command: /impeccable quieter

### [P2] Hardcoded English on the most destructive control
Settings.tsx:544 renders the literal `Restore from backup…` while `settings.backup.restore` exists and is already translated into all seven locales, directly beside `t('settings.backup.export')`. Also :347 placeholder, :368 `alt="Profile"`; dead keys `settings.visual.font`/`styleNotes`/`stylePlaceholder`.
Why: a Dutch user sees one English button on the action that can wipe their profile.
Fix: use the existing keys, translate alt text, delete dead keys.
Command: /impeccable harden

## Persona Red Flags

Jordan (first-timer): model dropdown (:328) = 8 raw IDs, 3 vendors, no descriptions/prices/recommended marker; hint restates the ID. "Advanced — AI prompts" barrier is the word "Advanced"; edits silently degrade every CV forever with no "defaults modified" state visible outside the collapsed section.

Sam (screen reader/keyboard): zero `<h2>`. Palette names live in `title`/`aria-label` only — seven "toggle button, not pressed" with no group name. Download bar (EngineSettings.tsx:131) is a bare div: no `role="progressbar"`, no `aria-valuenow`, no live region — a 2.5 GB download announces nothing until the final toast. PhotoCropModal pan is pointer-only (no `onKeyDown`) yet its help text says "Drag the photo to reposition it". Loading state (:265) unmounts the `<h1>`.

Priya (non-technical self-hoster): "OpenRouter Connection" names an unknown company and asks for a billable credential with no statement of where it's stored (that promise is three cards down in `settings.backup.note`). Engine/OpenRouter split makes a second card appear possibly off-screen, unannounced. `Download model` = 2.5 GB, no time estimate, no mention it's resumable, no cancel. Backup — the feature she most needs — is the fifth card down, unprompted.

## Minor Observations

- `settings.template.appliesToAll` sits below the Save button — context after the commit point.
- `.section-title` is `--fs-lg` while DESIGN.md's Headline tier starts at `--fs-xl`.
- index.css has exactly one `@media` rule (prefers-reduced-motion), zero width breakpoints. EngineSettings.tsx:97 hardcodes `1fr 1fr` (Onboarding.tsx:87 already uses auto-fill/minmax). Fixed px at :503 (140), :515 (110), :359 (120) don't scale at 200% zoom.
- `isCustomModel`/`__custom__` logic is hard to follow; :345 reads from `settings.openrouter_model` rather than `customModel`, so editing a saved custom model fights the controlled value.
- `handleImport` hard-reloads after 900ms; a missed toast reads as a spontaneous restart.
- 41 inline `style={{}}` vs 31 `className` in one file.

## Questions to Consider

1. If `cv_design_preferences` lives in profile.json, why is it edited on Settings at all? Moving it to Profile/Applications makes Settings four cards and evaporates the save-model divergence.
2. Who edits a raw AI prompt but can't be trusted with a config file? That section costs four textareas, client+server validation, four payload fields, and silent output degradation. What breaks if it's deleted?
3. Why does the page that can destroy everything never prompt a backup, while the page that can't has undo on every removal? What if Restore took an export first?
