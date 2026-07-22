## ADDED Requirements

### Requirement: AI-suggested target job titles

The Preferences page SHALL offer AI-generated candidate job titles for the target-roles
question, derived from the user's profile, on explicit user request only. Suggestions
SHALL be presented as the same one-tap suggestion chips used by the dealbreakers
question, and tapping one SHALL append that title to `preferences.target_roles`.

The system SHALL NOT spend LLM tokens on suggestions unless the user asks for them.

#### Scenario: User requests title suggestions

- **WHEN** the user activates the suggest-titles control on the Preferences page
- **THEN** the system makes one LLM call with the profile's experience, skills and
  professional title
- **AND** renders the returned titles as suggestion chips beneath the target-roles input

#### Scenario: User adds a suggested title

- **WHEN** the user taps a suggested title chip
- **THEN** that title is appended to `preferences.target_roles`
- **AND** the chip renders in its already-added state and is no longer activatable

#### Scenario: A suggested title is already a target role

- **WHEN** suggestions are rendered and a returned title already appears in
  `preferences.target_roles`
- **THEN** that chip renders in its already-added state without the user tapping it

#### Scenario: Page opens

- **WHEN** the Preferences page loads
- **THEN** no suggestion LLM call is made
- **AND** titles from a previous request are shown if there are any

#### Scenario: Returning to the page after suggesting

- **WHEN** the user has requested titles, navigates away or reloads, and returns
- **THEN** the same titles are still shown, without a second LLM call

#### Scenario: The profile changed since the titles were suggested

- **WHEN** the user edits their profile and returns to the Preferences page
- **THEN** the previously suggested titles are still shown
- **AND** refreshing them requires an explicit request — the system never
  re-suggests on its own

#### Scenario: The profile has nothing to suggest from

- **WHEN** the user requests suggestions and the profile has no experience entries and no
  professional title
- **THEN** the system does not make an LLM call
- **AND** tells the user which profile data is needed first

#### Scenario: The suggestion call fails

- **WHEN** the suggestion request fails or the engine is unavailable
- **THEN** the user is shown the error and the target-roles input remains editable and
  unchanged

### Requirement: Example chips for the great-match question

The Preferences page SHALL offer fixed example phrases for the "what makes a job a great
match" question using the same one-tap suggestion chips as the dealbreakers question.
These examples SHALL be static translatable text, not AI-generated.

#### Scenario: User taps a great-match example

- **WHEN** the user taps an example chip under the great-match question
- **THEN** the phrase is appended to `preferences.looking_for`, joined to any existing
  text with the same separator and casing rules the dealbreakers chips use

#### Scenario: An example is already present in the answer

- **WHEN** the great-match answer already contains an example phrase
- **THEN** that chip renders in its already-added state and is not activatable

### Requirement: Working languages are read from the profile

Working languages SHALL have exactly one source of truth: `skills.languages` on the
profile. The Preferences page SHALL display them read-only, with a route to the Profile
section that owns them, and SHALL NOT offer an editable languages control.

Everything that consumes working languages — the job-relevance prompt and the generic
application's role brief — SHALL read `skills.languages`.

#### Scenario: Preferences shows profile languages

- **WHEN** the Preferences page renders and `skills.languages` contains entries
- **THEN** those languages are listed read-only under the where/how-to-work question
- **AND** a link to the Profile languages section is offered

#### Scenario: No languages on the profile

- **WHEN** the Preferences page renders and `skills.languages` is empty
- **THEN** the page states that no working languages are set and links to the Profile
  section to add one

#### Scenario: Role brief includes working languages

- **WHEN** a generic application builds its role brief
- **THEN** the working-languages line is composed from `skills.languages`

### Requirement: Profile requires at least one language

A profile SHALL carry at least one language entry. A newly created profile SHALL be
seeded with one empty language row so the section is never blank, and the Profile page
SHALL indicate that the languages section still needs an answer while no language is
filled in.

#### Scenario: New profile is created

- **WHEN** a blank profile is created
- **THEN** `skills.languages` contains exactly one entry with an empty language name

#### Scenario: Languages section is unanswered

- **WHEN** the Profile page renders and no entry in `skills.languages` has a non-empty
  language name
- **THEN** the languages section is marked as requiring an answer

#### Scenario: Languages section is answered

- **WHEN** at least one entry in `skills.languages` has a non-empty language name
- **THEN** the languages section shows no requirement marker

### Requirement: Existing language preferences migrate into the profile

Loading a profile that carries `preferences.languages` SHALL move those values into
`skills.languages` when no language entry has a name yet, and SHALL drop
`preferences.languages` from the resulting profile. The migration SHALL be idempotent.

#### Scenario: Old profile with only preference languages

- **WHEN** a profile with `preferences.languages` of `["Dutch", "English"]` and an empty
  `skills.languages` is loaded
- **THEN** `skills.languages` contains an entry for Dutch and one for English
- **AND** the loaded profile has no `preferences.languages` key

#### Scenario: Old profile that already lists languages on the profile

- **WHEN** a profile carries both `preferences.languages` and at least one named entry in
  `skills.languages`
- **THEN** `skills.languages` is left unchanged
- **AND** the loaded profile has no `preferences.languages` key

#### Scenario: Already-migrated profile

- **WHEN** an already-migrated profile is loaded again
- **THEN** `skills.languages` is unchanged
