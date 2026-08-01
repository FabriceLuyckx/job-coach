## 1. Row primitive

- [x] 1.1 Add `.cv-row` styles to `frontend/src/index.css`: one `--board` panel (`--r-panel`,
  `--line` hairline) whose rows are split by a bottom hairline, last row none — checkbox, name
  button (chevron + label), and a right-aligned `--data-font` meta cell. Off-CV rows step tone,
  never fade opacity (DESIGN.md).
- [x] 1.2 Style the off-CV provenance marks as muted mono text on the row, reusing the existing
  vocabulary (dashed = AI's call, struck = the user's) for the label without making style the
  only carrier of the distinction.
- [x] 1.3 Add the board header rule: title, `N of M` count in `--data-font`, save state on the
  right.
- [x] 1.4 Bring `.skill-toggle` to a 24px minimum target (WCAG 2.2 2.5.8) — the 6px `.skill-tags`
  gap does not earn the spacing exception, same reasoning as the existing `.tag button` note.

## 2. Section list in `CVEditor.tsx`

- [x] 2.1 Extend `readSections()` to union `excluded_sections` alongside `hidden_sections`, and
  keep the existing "return early on an empty DOM read" guard so rows stay in CV order.
- [x] 2.2 Replace `toggleSection` + `restoreSection` with one `setSection(key, show)`: show
  clears the key from both `hidden_sections` and `excluded_sections`, hide adds it to
  `hidden_sections` — the shape `setSkills` already has. Keep the instant DOM hide.
- [x] 2.3 Add `const [openRow, setOpenRow] = useState<string | null>('summary')` — accordion, one
  row open, summary open on load.
- [x] 2.4 Render the row list: one `.cv-row` per key from `sections`, checkbox state from
  `hidden`/`excluded`, meta cell showing provenance for off-CV rows and the per-row count for
  `experience` (roles) and `skills` (`N of M`). Rows without a body render no chevron and no
  `aria-expanded`; the name button gets `aria-controls` pointing at its body.
- [x] 2.5 Body per key via a `switch`, default none: `summary` → the existing textarea, its
  bold/italic key handling and the AI-summary button; `experience` → the per-role
  `BulletListEditor` blocks; `skills` → the existing `.skill-group` markup and `setSkills`.
- [x] 2.6 Move the save state (`saveLabel`) into the board header so it covers every edit, and
  surface a save error there.
- [x] 2.7 Add the textual provenance to the skill toggles alongside their existing strike/dash
  treatment, so section and skill provenance read alike and neither depends on seeing it. Keep the
  visual vocabulary exactly as `cv-skills` describes it.
- [x] 2.8 Delete the `.editor-clusters` block, the two `Collapsible` disclosures, the
  `chip-restore` row, and the bordered content panel.

## 3. Placement

- [x] 3.1 Reorder the tab: job strip → actions row → tailoring notes → AI caveat → photo nudge →
  editing board → preview.
- [x] 3.2 Confirm the regeneration busy overlay still covers the preview after the move, and that
  `applyScale`'s `ResizeObserver` still observes the iframe.

## 4. Accessibility

- [x] 4.1 `Applications.tsx`: pass `headingLevel={2}` to the application row's `Collapsible`, so
  the editor's headings do not skip a level.
- [x] 4.2 Board title as `<h3>`; each expandable row wraps its disclosure button in an `<h4>`.
  Rows without a body get no heading — they are controls, not regions.
- [x] 4.3 Replace the summary's `<div class="editor-cluster-label">` with a real
  `<label htmlFor>` bound to the textarea. Give the row checkbox and the disclosure button
  accessible names from the section label.
- [x] 4.4 `role="status"` on the board header's save state, announcing the settled states (saved,
  failed) rather than the transient "saving" tick.
- [x] 4.5 `role="status"` on the regeneration overlay, carrying the stage text it already renders;
  `role="alert"` on the error message.

## 5. Preview refresh

- [x] 5.1 Capture `contentWindow.scrollY` before a preview reload and restore it `onLoad`, so an
  edit does not send the reader back to the top of the CV.
- [x] 5.2 Stop bumping `previewKey` for section visibility changes — `setSection` already applies
  them to the preview's DOM, so the reload only undid and redid its own work. Text and skill edits
  still reload.
- [x] 5.3 Fix `applyScale`'s forced sync layout: capture the unscaled `scrollWidth` in a ref at
  `onLoad` (zoom is 1 there) and make the resize path a pure read of `clientWidth` plus one write,
  instead of write-`zoom:1` → read → write.

## 6. Copy and cleanup

- [x] 6.1 `frontend/src/locales/en.json`: add the board title, the `N of M sections` count, the
  two provenance marks (used by both section rows and skill toggles), the row-level help, and the
  accessible names for the checkbox and disclosure. Reuse `cveditor.sections.*` labels as-is.
  Do NOT touch any other locale file.
- [x] 6.2 Remove the now-dead keys (`sectionsTitle`, `sectionsShownCount`, `aiLeftOut`,
  `restoreTip`, `skillsTitle`, `editContent`, `editHelp` and any other orphan) from `en.json`.
- [x] 6.3 Remove `.chip-check`, `.chip-restore`, `.editor-clusters` from `index.css`. Keep
  `.editor-cluster-label`, `.cluster-count` (GuideView + Applications use them) and the
  `.skill-group*` rules (reused inside the Skills row).

## 7. Verification

- [x] 7.1 `cd frontend && npm run build` passes (tsc + vite).
- [x] 7.2 `node scripts/check_contrast.mjs` passes.
- [x] 7.3 `uv run pytest` — the `tests/test_i18n.py` shipped-catalog parity failure is expected
  after an `en.json` edit and is resolved by the pre-commit hook; every other test passes.
- [x] 7.4 Re-run the impeccable audit on `CVEditor.tsx` and confirm accessibility clears its
  previous 1/4 — heading outline present, every field named, save state and regeneration
  announced, provenance in text, no sub-24px target.
- [x] 7.5 Update `CLAUDE.md`'s CV-editor description (Phase 4 / Applications page) to the unified
  surface, replacing the "derives its checkbox row from the keys it finds in the rendered
  preview" and skills-cluster paragraphs.
