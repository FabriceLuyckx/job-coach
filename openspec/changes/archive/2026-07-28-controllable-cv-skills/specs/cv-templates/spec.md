# cv-templates Delta

## MODIFIED Requirements

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
