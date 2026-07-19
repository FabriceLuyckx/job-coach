# cover-letter-guide

## Purpose

Given a job posting URL, produce a lean cover-letter *writing guide* — a
skeleton the candidate writes from, never a finished letter.

## Requirements

### Requirement: Lean cover-letter skeleton output

The system SHALL produce a cover-letter writing guide as a skeleton with exactly
four top-level fields: `job_title`, `employer`, a `structure` array of 3–5
sections, and a `tips` array of short reminders. It SHALL NOT emit an `angle`
field, a top-level `evidence` map, or a `gaps` field.

#### Scenario: Guide has only the four lean fields

- **WHEN** a cover-letter guide is generated for a posting
- **THEN** the returned object contains `job_title`, `employer`, `structure`, and
  `tips`
- **AND** it contains no `angle`, top-level `evidence`, `gaps`, or `tone` field

#### Scenario: Structure stays within 3–5 sections

- **WHEN** the AI returns the structure
- **THEN** it contains between 3 and 5 sections, each named by the AI for this
  posting (not a fixed template)

### Requirement: Per-section evidence co-located with the goal

Each `structure` section SHALL be an object with `title`, `goal`, and an
`evidence` array. `goal` states what the paragraph must achieve; `evidence`
lists the real profile facts to cite in that paragraph. The system SHALL NOT
invent experience absent from the profile.

#### Scenario: Section carries what-to-say and which-fact-to-use

- **WHEN** a section is produced
- **THEN** `goal` describes what the paragraph should accomplish for this posting
- **AND** `evidence` lists specific, real facts drawn from the candidate profile

### Requirement: No finished prose

The guide SHALL remain a plan the candidate writes from — every `goal`,
`evidence` item, and `tip` is an instruction or a real fact, never a sentence or
paragraph meant to be pasted verbatim into a letter.

#### Scenario: Output contains no paste-ready sentences

- **WHEN** the guide is generated
- **THEN** no field contains first-person letter prose ready to paste (e.g. "I
  have long admired your mission")

### Requirement: Practical writing tips

The guide SHALL include a `tips` array of short, practical reminders grounded in
cover-letter best practice — including addressing a real person, quantifying
impact, a length target (~250–350 words), and matching the employer's tone and
the output language.

#### Scenario: Tips reflect the coaching framework

- **WHEN** the guide is generated
- **THEN** `tips` contains concise reminders covering audience, quantified
  impact, length, and tone/language

### Requirement: Backward-compatible rendering of stored guides

The frontend SHALL render a cover-letter guide without error even when a stored
guide predates this change (i.e. lacks `tips`/per-section `evidence` or still
carries `angle`/`gaps`/`tone`/`pointers`). Missing arrays SHALL be treated as
empty and unknown legacy fields SHALL be ignored. No data migration is required.

#### Scenario: Old history row renders

- **WHEN** a user opens a previously generated guide that used the old shape
- **THEN** the page renders the available titles and goals without crashing
- **AND** absent new fields render as empty rather than throwing

### Requirement: Guide from a profile role brief

The system SHALL be able to produce a cover-letter writing guide from a role
brief synthesized from the user's profile preferences instead of a fetched job
posting, for the generic application. Such a guide SHALL follow every existing
rule for guides — a 3–5 section writing skeleton with per-section goals and
evidence drawn from real profile facts plus practical tips, and never finished
letter prose — and SHALL be stored and rendered by the same history and view
used for posting-based guides.

Because no employer is known, the guide SHALL be framed around the user's
target roles rather than naming a specific employer, and its tips SHALL
account for the letter being adapted per employer.

#### Scenario: Guide generated without a posting

- **WHEN** the generic application's cover-letter guide is generated
- **THEN** no posting URL is fetched
- **AND** a 3–5 section guide with evidence and tips is produced from the role
  brief and profile

#### Scenario: No invented employer

- **WHEN** the generic guide is rendered
- **THEN** it does not present a specific employer as the letter's recipient
- **AND** it reminds the writer to adapt it to the employer they send it to

#### Scenario: Same view and storage

- **WHEN** a generic guide exists
- **THEN** it appears in the letter history and renders in the standard guide
  view with its copy-as-Markdown action
