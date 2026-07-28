# cv-templates Specification

## Purpose
TBD - created by archiving change add-cv-templates. Update Purpose after archive.
## Requirements
### Requirement: Built-in template choice

The system SHALL ship at least four visually distinct CV templates, including
the existing two-column default, selectable by the user in Settings via
simplified preview icons. The selected template SHALL be stored in the profile's
design preferences and used for every subsequent CV render (preview, HTML
output, and PDF) of every CV. An unknown or missing template value SHALL fall
back to the default template rather than failing.

#### Scenario: Picking a template changes every render

- **WHEN** the user selects the "classic" template in Settings and saves
- **THEN** opening any existing CV's preview renders it with the classic layout
- **AND** the downloaded PDF uses the same layout

#### Scenario: Unknown template falls back

- **WHEN** the profile's design preferences name a template that does not exist
- **THEN** CVs render with the default template

### Requirement: Every template honors the rendering contract

Every built-in template SHALL consume the same rendering context (profile
sections, labels, language, photo, hidden sections, and the tailoring plan's
per-CV skill choices) and SHALL: tag each section root with its `data-section`
key, omit sections listed in `hidden_sections`, render the photo only when
provided and not hidden, show skills as the `cv-skills` capability defines, and
contain its own print CSS so multi-page PDF export paginates
cleanly — including keeping every rendered string extractable as text from the
PDF. Templates SHALL render without error for a complete example profile.

#### Scenario: Hidden sections stay hidden across templates

- **WHEN** a CV whose plan hides the publications section is rendered with any
  built-in template
- **THEN** the output contains no publications section

#### Scenario: Skills left off the CV do not print

- **WHEN** a CV whose plan excludes two skills is rendered with any built-in
  template
- **THEN** neither appears, and a group left empty by them prints no heading

#### Scenario: No skill is marked as emphasised

- **WHEN** a CV is rendered with any built-in template
- **THEN** the visible skills of a group all render alike, with no emphasis mark
  on any of them

#### Scenario: The PDF's text is machine-readable

- **WHEN** any built-in template is exported to PDF
- **THEN** every rendered string — including the name, title and contact line in
  a coloured header — can be extracted as text rather than raster

#### Scenario: Example profile smoke render

- **WHEN** each built-in template is rendered with the bundled example profile
- **THEN** rendering completes without error and the output contains
  `data-section` markers

### Requirement: Curated palettes plus custom accent

Each template SHALL offer a set of curated color palettes shown as tappable
swatches in Settings; applying a palette SHALL set the accent color and the
template's additional color slots together. Independently, the user SHALL be
able to set a custom accent color, which templates use as the main color and
from which they derive their shades. Color choices SHALL persist in the
profile's design preferences and apply to all templates when switching.

#### Scenario: Applying a palette recolors the CV

- **WHEN** the user taps a palette swatch and saves
- **THEN** subsequent CV renders use that palette's accent and color slots

#### Scenario: Custom accent still works

- **WHEN** the user enters a custom accent color instead of a palette
- **THEN** the CV renders with that accent and shades derived from it

### Requirement: Color values are validated

Because color values are interpolated into the CV's stylesheet, the system
SHALL accept only six-digit hex colors (`#RRGGBB`) for the accent and palette
slots when loading the profile, replacing invalid values with safe defaults,
and SHALL accept only known template ids, replacing unknown ones with the
default template.

#### Scenario: Invalid color is dropped

- **WHEN** the stored profile contains a non-hex accent value (e.g. a CSS
  injection attempt)
- **THEN** the profile loads with the default accent color instead

### Requirement: Template registry endpoint

The system SHALL expose the list of built-in templates and their palettes via
an API endpoint, with no LLM involvement, so the Settings page can build the
picker. Template and palette display names SHALL come from the UI's translation
catalog, not the registry.

#### Scenario: Registry lists templates and palettes

- **WHEN** the templates endpoint is called
- **THEN** it returns each built-in template id with its palettes (accent +
  color slots)

### Requirement: Photo can be zoomed and repositioned

The user SHALL be able to adjust how the uploaded photo is framed on the CV —
zooming in and moving the visible center point — through a visual editor in
Settings (drag to reposition, control to zoom). The adjustment SHALL be stored
as crop parameters applied at render time; the uploaded image file itself SHALL
NOT be re-encoded, so the adjustment is lossless and re-editable. Every
built-in template SHALL apply the same crop parameters within its own photo
frame, in both preview and PDF output. Crop values SHALL be numerically clamped
when the profile is loaded.

#### Scenario: Crop applies across templates

- **WHEN** the user zooms the photo and moves its center point, then switches
  templates
- **THEN** every template shows the same framing of the photo in preview and PDF

#### Scenario: Re-editing starts from the original

- **WHEN** the user reopens the photo editor after a previous adjustment
- **THEN** the full original image is available to reframe (no quality loss)

### Requirement: Each template places the photo deliberately

Each built-in template SHALL define its own photo position integrated into its
layout (e.g. sidebar top, header band, centered above the name) rather than a
shared default spot, and SHALL omit the photo cleanly (no gap or misalignment)
when no photo is included.

#### Scenario: Photo sits in the template's designed spot

- **WHEN** a CV with a photo is rendered with the banner template
- **THEN** the photo appears inside the header band as part of its design

#### Scenario: Layout is clean without a photo

- **WHEN** a CV without a photo is rendered with any template
- **THEN** the layout shows no empty photo placeholder

### Requirement: Include-photo default saves itself

The Settings control for including the photo SHALL represent whether new CVs
include the photo by default, and SHALL persist immediately when toggled —
without requiring any separate save action and without marking unrelated
settings as unsaved. A failure to persist SHALL revert the control and surface
an error. Removing the photo from an individual CV SHALL remain possible via
the CV editor's photo visibility toggle.

#### Scenario: Toggle persists on its own

- **WHEN** the user checks "include photo by default"
- **THEN** the preference is saved immediately
- **AND** no other card's save button becomes armed

#### Scenario: Per-CV removal still works

- **WHEN** the default is on but the user hides the photo on one CV in the
  CV editor
- **THEN** that CV renders without the photo while other CVs keep it

### Requirement: Template preview icons render without generated assets

The Settings picker SHALL show each template as a simplified schematic preview
of its layout, rendered from the palette colors currently selected, without
requiring screenshot generation, image assets, or any AI call.

#### Scenario: Thumbnails reflect the chosen palette

- **WHEN** the user taps a different palette swatch
- **THEN** the template preview icons recolor to that palette immediately,
  before saving

