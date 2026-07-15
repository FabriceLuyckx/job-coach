## ADDED Requirements

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
