# Design — Add CV Templates

## 1. Color model

Keep the proven one-accent + `color-mix()` derivation, extended with two
optional named slots. `cv_design_preferences` becomes:

```json
{ "template": "default", "accent_color": "#1B3A6B",
  "colors": { "ink": "#1F2933", "paper": "#FFFFFF" },
  "include_photo": false }
```

- `accent_color` stays the main color — the custom picker keeps writing it,
  nothing migrates.
- `colors.ink` (body/heading text base) and `colors.paper` (page/sidebar tint
  base) are optional; templates read them `| default('#…', true)` and derive
  shades via `color-mix()`, exactly like accent today.
- A **palette** = `{accent_color, colors}`. Tapping a palette swatch writes both
  keys into the profile object client-side.

**Validation (security)** — these hexes are interpolated unescaped into a
`<style>` block. Extend `_migrate_design_prefs_v3` in
`app/services/cv_renderer.py` (the choke point that already coerces these keys):

- `accent_color` and every `colors` value must match `#RRGGBB`
  (`re.fullmatch(r"#[0-9a-fA-F]{6}", v)`) — else drop to default / drop the key.
- `template` must be a registry id — else `"default"`. (Belt to the existing
  `TemplateNotFound` → default suspenders in `_render_html`.)

## 2. Template registry

`templates/cv/manifest.json`:

```json
[
  { "id": "default",
    "palettes": [
      { "id": "navy", "accent_color": "#1B3A6B",
        "colors": { "ink": "#1F2933", "paper": "#FFFFFF" } },
      { "id": "forest", "accent_color": "#1F5F3F", "colors": { … } }
    ] },
  { "id": "classic", "palettes": [ … ] }
]
```

- `list_templates()` in `cv_renderer.py`: read + cache the manifest
  (`functools.lru_cache`); used by normalize (allowlist) and the API.
- `GET /api/cv/templates` in `app/api/cv.py`: returns the manifest as-is. No
  LLM, no auth change (localhost app).
- Display names / palette names are **i18n keys**, never manifest strings:
  `settings.template.names.<id>`, `settings.template.palettes.<id>` in
  `en.json` — the pre-commit hook translates shipped locales. Do NOT run
  translate_locales.py.

## 3. The five templates

All must honor the in-file contract documented at the top of `default.html`:
`data-section="<key>"` on every section root, respect `hidden_sections`,
`{% if photo and 'photo' not in hidden %}` guard, self-contained CSS incl.
print rules, same Jinja context (`**profile` spread + `labels`, `lang`,
`photo`, `hidden_sections`) and filters (`format_date`, `strip_scheme`,
`richtext`).

| id | Layout | Print CSS notes |
|----|--------|-----------------|
| `default` | current two-column, left sidebar | unchanged; add optional `ink`/`paper` reads |
| `classic` | single column, centered header, system-serif (Georgia) headings, hairline rules | trivial pagination (block flow) |
| `banner` | full-width accent header band, single column below, Inter | band prints once (it's the header, not fixed) |
| `compact` | two-column, **right** sidebar, tighter type/spacing | mirror default's fixed `.sidebar-band` repeat trick |
| `minimal` | typographic, no filled blocks, accent on rules/headings only | trivial pagination |

Each template ships 4–6 curated palettes in the manifest (navy, forest,
burgundy, charcoal, slate/warm-gray — tuned per template so e.g. `banner`'s
band colors stay readable with white text).

Per-template print CSS is the bulk of the effort. Single-column templates
paginate natively; `compact` copies the proven pattern from `default`
(`position: fixed` band repeats per page in Chromium, content absolute on page
1, `box-decoration-break: clone` on the main column).

## 4. Preview icons — CSS mockups, not screenshots

`frontend/src/components/TemplateThumb.tsx`: an abstract mini-mockup per layout
drawn with a handful of divs (sidebar rectangle + text-line bars, header band +
bars, centered lines, …), switched on a `layout` prop, sized ~90×120 (A4
ratio), colored from the palette currently selected. No Playwright, no image
assets, crisp at any DPI, and the thumbnails double as a live palette preview.

## 5. Photo: crop, placement, include-by-default

### Crop = stored parameters, never a re-encoded image

`cv_design_preferences.photo_crop = { "zoom": 1.0–3.0, "x": 0–100, "y": 0–100 }`
(x/y are `object-position` percentages). Every template renders the photo in a
fixed frame with the same CSS pattern:

```css
.photo-frame { overflow: hidden; }
.photo-frame img { width: 100%; height: 100%; object-fit: cover;
  object-position: {{x}}% {{y}}%; transform: scale({{zoom}}); }
```

Print-safe in Chromium; the original upload is untouched (lossless, re-editable
forever); zero changes to the photo upload endpoint. In
`_migrate_design_prefs_v3`, clamp numerically (float coercion + range) — the
values are interpolated into style, so coercion is the sanitization.

### Editor UI

`frontend/src/components/PhotoCropModal.tsx`: an "Adjust photo" button beside
the photo preview in Settings opens a `Modal` (existing component) with the
image in a square frame — drag to pan (pointer events → x/y), a range slider
(+ wheel) for zoom, live CSS preview using the exact template pattern above.
Hand-rolled ~80 lines; no new dependency, no canvas. Confirm writes
`photo_crop` via `putProfile`.
ponytail: square editor frame even though some templates crop to a circle —
a centered cover-crop reads correctly in both; revisit only if users complain.

### Placement per template

Each template places the photo where its design wants it (all via the shared
frame pattern): `default` sidebar-top circle (reworked from today's awkward
spot), `banner` inside the header band (right-aligned circle on the accent),
`classic` top-center above the name, `compact` small circle atop the right
sidebar, `minimal` small square top-right.

### Include-photo checkbox

- Relabel: "Include photo on new CVs by default" (per-CV removal already
  exists — CVEditor's `photo` visibility toggle in `hidden_sections`).
- **Auto-save on toggle**: its own `api.putProfile` call in the onChange
  handler (optimistic, revert + error toast on failure), and **excluded from
  the `savedPrefs`/`prefsDirty` snapshot** so toggling it never arms the
  Visual-preferences SaveButton in the other card. (Snapshot comparison:
  stringify `cv_design_preferences` minus `include_photo`.)

## 6. Settings UI

One self-contained block inside the existing **Visual preferences** card
(`Settings.tsx` ~344–374) so the future tabs split moves it wholesale:

1. **Template grid** — `display:grid` of `TemplateThumb` buttons (same
   selected-outline idiom as the accent swatches at Settings.tsx:350);
   clicking writes `cv_design_preferences.template`.
2. **Palette row** for the selected template — each swatch a small stack of its
   2–3 colors; clicking writes `accent_color` + `colors`.
3. **Custom accent** — the existing `ACCENT_PRESETS` swatches + free-hex input,
   unchanged.
4. **Save** — unchanged: same `cv_design_preferences` object through
   `saveVisualPrefs()` → `api.putProfile`, `savedPrefs`/`prefsDirty` snapshot,
   shared `SaveButton`.

No in-Settings CV preview: `_current_html` (app/api/cv.py) already re-renders
every preview/PDF from the live profile, so any open CV on Applications shows
the new design immediately; a `help-text` line says so.
ponytail: skip a query-param preview endpoint — add only if users ask.

## 7. Types & API client

- `frontend/src/types.ts` `CVDesignPreferences`: add
  `template: string`, `colors?: { ink?: string; paper?: string }`, and
  `photo_crop?: { zoom: number; x: number; y: number }`.
- `frontend/src/api.ts`: `getTemplates()` →
  `{ id: string; palettes: { id: string; accent_color: string; colors: Record<string,string> }[] }[]`.

## Testing (no LLM anywhere)

New small test block (tests/test_hardening.py or `tests/test_templates.py`):

1. **Manifest ↔ files**: every manifest id has `templates/cv/<id>.html` and
   every `*.html` (minus none) appears in the manifest.
2. **Normalize validation**: bad hex → default; unknown template → `default`;
   valid `colors` passthrough; `photo_crop` clamped to numeric ranges (junk →
   defaults).
3. **Smoke-render every template** with `profile/profile.example.json` through
   `build_env()` + `cv_labels('en')`: render must not raise, output contains
   `data-section=` and the palette hexes.

Runnable check: `uv run pytest` + `cd frontend && npx tsc --noEmit`.
Manual print-CSS verification (PDF per template) is a human step — NOT encoded
as task checkboxes, per project convention.
