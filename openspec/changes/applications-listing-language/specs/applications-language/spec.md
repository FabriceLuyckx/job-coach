## ADDED Requirements

### Requirement: Single per-listing language control

Each application row on the Applications page SHALL present exactly one language
control, positioned above the CV | Letter tab strip, that represents the language
of the whole application. Neither the CV editor nor the per-tab "create missing
artifact" CTA SHALL present its own separate language selector.

The control SHALL default to the language of an existing artifact for that
listing (the CV's language if present, otherwise the letter's), falling back to
English when neither exists yet.

#### Scenario: One control governs the listing

- **WHEN** a user expands an application row that has a generated CV and/or letter
- **THEN** a single language selector is shown above the tabs
- **AND** no language selector appears inside the CV editor
- **AND** no language selector appears inside a tab's "create" CTA

#### Scenario: Control reflects the current language

- **WHEN** an application's CV was generated in Dutch
- **THEN** the listing language control shows Dutch as its current value

### Requirement: Changing the listing language re-generates both artifacts

When the user changes an application's language control, the system SHALL bring
every existing artifact for that listing into the new language: an existing CV
SHALL be re-tailored into the new language while preserving the user's edits, and
an existing cover-letter guide SHALL be regenerated in the new language with the
prior-language guide removed. Artifacts that do not yet exist SHALL adopt the new
language when they are later created.

While the re-generation runs, the control SHALL indicate progress, and a failure
SHALL be surfaced inline without discarding the artifacts that succeeded.

#### Scenario: Both artifacts follow the new language

- **WHEN** an application has both a CV and a letter in English and the user
  switches the language control to Dutch
- **THEN** the CV is re-tailored to Dutch keeping the user's edits
- **AND** the letter is regenerated in Dutch and the English letter is removed
- **AND** both tabs display the Dutch versions

#### Scenario: Only the existing artifact is regenerated

- **WHEN** an application has a CV but no letter and the user changes the language
- **THEN** the CV is re-generated in the new language
- **AND** the letter, when later created, is generated in the new language

#### Scenario: Failure is reported without data loss

- **WHEN** re-generation for a language change fails
- **THEN** an inline error is shown
- **AND** the previously generated artifacts remain available
- **AND** the language control reverts so re-selecting the language retries only
  the artifacts still in the old language

### Requirement: Auto-detect language for a new application

The New application slot SHALL offer an "Auto-detect" language option and SHALL
default to it. When a user generates from a pasted job URL with Auto-detect
selected, the system SHALL determine the posting's language from its URL before
generating, and generate the requested CV and/or letter in that detected
language. A single detection SHALL serve both artifacts for that generation.

The system SHALL expose an endpoint that, given a job posting URL, returns the
posting's language as an ISO-639-1 code, defaulting to English when the language
cannot be determined.

#### Scenario: Pasted URL is detected before generating

- **WHEN** a user pastes a Dutch job posting URL in the New slot with Auto-detect
  selected and requests both a CV and a letter
- **THEN** the system detects the posting language once
- **AND** generates both the CV and the letter in Dutch

#### Scenario: Explicit language overrides detection

- **WHEN** a user selects a specific language instead of Auto-detect in the New
  slot
- **THEN** the system generates in the chosen language without detecting

#### Scenario: Detection endpoint returns a language code

- **WHEN** the detect-language endpoint is called with a valid posting URL
- **THEN** it returns a two-letter ISO-639-1 language code
- **AND** returns English when the language cannot be determined

### Requirement: Accepted-job language is unchanged

Applications created by accepting a Job Suggestion SHALL continue to use the
language already detected server-side at accept time for both the CV and the
cover-letter guide, with no additional detection step on the Applications page.

#### Scenario: Accepted job keeps its detected language

- **WHEN** a user accepts a suggestion whose posting was detected as French
- **THEN** the resulting application's CV and letter are generated in French
- **AND** the Applications page shows French as the listing language

### Requirement: Long-running generations are cancellable

Every long-running generation on the Applications page — creating a CV or letter,
generating a new application, and changing an application's language — SHALL
present a **Cancel** control while it runs. Cancelling SHALL stop the client from
waiting and return control of the UI immediately.

Cancelling SHALL also request the server to stop the underlying generation so it
stops consuming resources. Because the local model serializes all AI work behind a
single engine, an in-flight generation that is not stopped blocks every other AI
feature; therefore a cancelled local generation SHALL be interrupted promptly and
release the engine, rather than running to completion.

#### Scenario: Cancel returns control of the UI

- **WHEN** a generation is running and the user clicks Cancel
- **THEN** the progress state clears and the create controls return
- **AND** no error is shown (cancellation is not a failure)

#### Scenario: Cancel frees the local engine

- **WHEN** a generation running on the local model is cancelled
- **THEN** the server interrupts it within a short time
- **AND** the engine becomes available for other AI actions instead of staying
  blocked until the original generation would have finished
