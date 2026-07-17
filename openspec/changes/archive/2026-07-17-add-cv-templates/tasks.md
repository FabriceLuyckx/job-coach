## 1. Backend — registry, validation, endpoint

- [x] 1.1 Create `templates/cv/manifest.json`: five template ids, each with 4–6
  curated palettes (`{id, accent_color, colors: {ink, paper}}`).
- [x] 1.2 `app/services/cv_renderer.py`: `list_templates()` reading + caching
  the manifest; extend `_migrate_design_prefs_v3` — `#RRGGBB` validation for
  `accent_color` and `colors` values (invalid → default/dropped), `template`
  allowlisted against the manifest (unknown → `default`), `colors` passthrough,
  `photo_crop {zoom, x, y}` numerically clamped (junk → defaults).
- [x] 1.3 `app/api/cv.py`: add `GET /api/cv/templates` returning the manifest.

## 2. Templates

- [x] 2.1 `templates/cv/default.html`: read optional `colors.ink` /
  `colors.paper` with current values as defaults (rendering unchanged for
  existing profiles); rework the photo into a sidebar-top crop frame applying
  `photo_crop`.
- [x] 2.2 `templates/cv/classic.html` — single column, centered header,
  system-serif headings, hairline rules; photo top-center above the name;
  full contract + print CSS.
- [x] 2.3 `templates/cv/banner.html` — full-width accent header band, single
  column; photo as right-aligned circle inside the band; contract + print CSS.
- [x] 2.4 `templates/cv/compact.html` — right sidebar, dense type; small photo
  atop the sidebar; mirror default's fixed sidebar-band print trick; contract
  + print CSS.
- [x] 2.5 `templates/cv/minimal.html` — typographic, no filled blocks; small
  photo top-right; contract + print CSS.
- [x] 2.6 All five templates share the crop-frame CSS pattern
  (`object-fit: cover; object-position: x% y%; scale(zoom)`) and collapse
  cleanly when no photo is passed.

## 3. Frontend — picker UI

- [x] 3.1 `frontend/src/types.ts` + `frontend/src/api.ts`: extend
  `CVDesignPreferences` (`template`, `colors?`, `photo_crop?`), add
  `getTemplates()`.
- [x] 3.2 `frontend/src/components/TemplateThumb.tsx`: schematic layout
  mockups (per-layout div composition), colored by the active palette.
- [x] 3.3 `frontend/src/pages/Settings.tsx`: template grid + palette swatch row
  inside the Visual preferences card, writing into the existing
  `cv_design_preferences` object; save via the unchanged
  `saveVisualPrefs`/`SaveButton` flow.
- [x] 3.4 `frontend/src/components/PhotoCropModal.tsx`: drag-to-pan +
  zoom-slider photo editor in the shared `Modal` (pointer events, live CSS
  preview, no new dependency); "Adjust photo" button beside the photo preview
  in Settings; confirm writes `photo_crop` via `putProfile`.
- [x] 3.5 Settings photo checkbox: relabel to "include by default on new CVs",
  auto-save on toggle with its own `putProfile` (optimistic, revert + toast on
  error), and exclude `include_photo` from the Visual-prefs dirty snapshot so
  it never arms the other card's SaveButton.
- [x] 3.6 `frontend/src/locales/en.json`: `settings.template.*` keys (title,
  help, template names, palette names) + photo editor/checkbox keys. Do NOT
  run translate_locales.py.

## 4. Tests & docs

- [x] 4.1 Tests: manifest↔file consistency; normalize hex/template validation
  + `photo_crop` clamping; smoke-render each template with
  `profile/profile.example.json` (no exception, `data-section=` present),
  with and without a photo.
- [x] 4.2 `uv run pytest` passes; `cd frontend && npx tsc --noEmit` clean.
- [x] 4.3 Update `CLAUDE.md` (`cv_design_preferences` row, templates dir in the
  structure, endpoint list) and `README.md` (template chooser in Settings docs).
