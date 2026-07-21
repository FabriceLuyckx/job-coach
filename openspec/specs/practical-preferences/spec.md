# practical-preferences

## Purpose

Capture the candidate's practical constraints (employment type, hours, salary,
availability, travel) as structured `preferences` fields instead of one free-text
box, so the Preferences page UI is guided and downstream AI features (generic
application briefs, job review, cover-letter guides) receive named values instead
of loosely-parsed prose.

## Requirements

### Requirement: Structured practical preference fields

The Preferences page SHALL capture the candidate's practical constraints through
dedicated controls rather than a single free-text box. The `preferences` object SHALL
carry these fields: `employment_types` (list of strings), `hours` (string),
`salary` (string), `availability` (string), `travel` (string), and the retained
free-text `notes` (string).

#### Scenario: Employment type is multi-select

- **WHEN** the user opens the practical section
- **THEN** they can select any combination of Permanent, Fixed-term, Freelance, and Internship
- **AND** each selection toggles independently and is stored in `preferences.employment_types`

#### Scenario: Hours and travel are single-choice

- **WHEN** the user answers Hours or Travel
- **THEN** exactly one option is selectable (Hours: Full-time / Part-time / No preference; Travel: None / Occasional / Frequent / No preference)
- **AND** the chosen option is stored as its canonical English string in `preferences.hours` / `preferences.travel`

#### Scenario: Salary, availability, and anything-else stay free-text

- **WHEN** the user has details that don't fit the fixed controls
- **THEN** short free-text inputs capture salary expectation and availability, and a free-text "Anything else" box (the retained `notes`) captures everything else

### Requirement: Backward-compatible migration

`normalize_profile()` SHALL seed empty defaults for the new practical fields on load,
without a schema version bump and without altering an existing `notes` value.

#### Scenario: Existing profile loads unchanged

- **WHEN** a profile saved before this change is loaded
- **THEN** `employment_types` defaults to `[]` and `hours`/`salary`/`availability`/`travel` default to `""`
- **AND** the existing `notes` free text is preserved verbatim
- **AND** re-running the migration on the result changes nothing (idempotent)

### Requirement: Practical fields reach the AI

The structured practical fields SHALL be available to the AI features that consume
preferences.

#### Scenario: Generic application reflects practical fields

- **WHEN** `role_brief()` builds the brief for a generic application
- **THEN** any set employment type, hours, salary, availability, and travel values appear as labelled lines in the brief

#### Scenario: Job review and letter guide see the fields

- **WHEN** a posting is reviewed or a cover-letter guide is built
- **THEN** the new keys are present in the `preferences` object those calls already receive, with no separate wiring required
