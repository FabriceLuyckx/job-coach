# Add CV Templates

## Why

The CV's look is fixed today: one template (`templates/cv/default.html`,
two-column dark blue) with a single accent-color picker in Settings. Users have
no way to pick a different layout, and one hex value is the only personalisation.
The template-dispatch groundwork already exists (`cv_design_preferences.template`
in the schema, `_render_html` loading `<name>.html` with a default fallback) but
only one template ships.

## What Changes

- **Five built-in templates** (`templates/cv/*.html`): the current `default`
  (two-column left sidebar) plus `classic` (single column, centered header,
  serif headings), `banner` (full-width accent header band), `compact`
  (right-sidebar, dense — for long CVs), and `minimal` (typographic, no filled
  blocks). All honor the existing in-file template contract (`data-section`
  tags, `hidden_sections`, photo guard, own print CSS, same Jinja context).
- **Template registry**: `templates/cv/manifest.json` — one source of truth
  listing each template id and its 4–6 curated color palettes. Served verbatim
  by a new `GET /api/cv/templates`; used server-side as the allowlist when
  normalizing `cv_design_preferences.template`.
- **Palette color model**: `cv_design_preferences` gains an optional `colors`
  dict (`ink`, `paper` slots) beside the existing `accent_color`; a palette
  preset writes both. Hex values are validated (`#RRGGBB`) at the existing
  normalize choke point — they're interpolated unescaped into a `<style>` block,
  so this also closes an injection surface.
- **Settings picker UI**: in the Visual preferences card — a template grid of
  simplified preview icons (abstract CSS mockups drawn in React, recolored live
  by the selected palette), a palette swatch row per template, and the existing
  custom accent picker. Saved through the unchanged
  `putProfile`/`saveVisualPrefs` machinery.
- **Photo editing (zoom + reposition)**: a crop editor (drag to pan, slider to
  zoom) stores `photo_crop {zoom, x, y}` in design preferences; templates apply
  it as pure CSS (`object-fit/object-position/scale`) inside their photo frame.
  The original upload is never re-encoded — lossless and re-editable, no
  backend upload changes.
- **Deliberate photo placement per template**: each of the five templates
  places the photo where its design wants it (sidebar-top circle, header-band
  circle, top-center, etc.) instead of today's awkward spot.
- **Include-photo checkbox fixed**: auto-saves on toggle (today it arms the
  Save button in a *different* card), relabelled to "include by default on new
  CVs" — per-CV removal already exists via the CV editor's photo visibility
  toggle.
- **Zero LLM tokens**: everything is static data + Jinja rendering; no AI call
  anywhere in the feature.

Explicitly deferred (user decisions): user template **upload** (a later change;
the registry design leaves room via a second `FileSystemLoader` path under
`DATA_DIR`), and the **Settings tabs split** (next change; the picker stays one
self-contained card so it moves into a tab untouched).

## Capabilities

### New Capabilities

- `cv-templates`: selectable built-in CV templates with curated palettes and a
  custom accent — registry, validation, rendering contract, and the Settings
  picker — plus photo crop editing, per-template photo placement, and the
  auto-saving include-photo default.

### Modified Capabilities

<!-- No existing capability spec covers CV rendering or design preferences. -->

## Impact

- **Backend**: `templates/cv/manifest.json` (new),
  `templates/cv/{classic,banner,compact,minimal}.html` (new),
  `templates/cv/default.html` (read optional `ink`/`paper` slots),
  `app/services/cv_renderer.py` (`list_templates()`, hex/allowlist validation in
  `_migrate_design_prefs_v3`), `app/api/cv.py` (`GET /api/cv/templates`).
- **Frontend**: `frontend/src/pages/Settings.tsx` (template grid + palette row,
  auto-saving photo checkbox, Adjust-photo button),
  `frontend/src/components/TemplateThumb.tsx` (new),
  `frontend/src/components/PhotoCropModal.tsx` (new), `frontend/src/api.ts` +
  `frontend/src/types.ts` (types + `getTemplates()`),
  `frontend/src/locales/en.json` (`settings.template.*`, photo keys — hook
  translates).
- **Tests/docs**: manifest↔file consistency, normalize validation, per-template
  smoke render with the example profile; `CLAUDE.md` + `README.md`.
- **No breaking changes**: `colors` is optional, `template` already defaults to
  `default`, existing profiles render identically.
