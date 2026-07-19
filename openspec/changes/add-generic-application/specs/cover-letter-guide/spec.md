## ADDED Requirements

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
