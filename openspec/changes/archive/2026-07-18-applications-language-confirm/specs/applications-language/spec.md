## MODIFIED Requirements

### Requirement: Changing the listing language re-generates both artifacts

When the user changes an application's language control, the system SHALL
bring every existing artifact for that listing into the new language: an
existing CV SHALL be re-tailored into the new language while preserving the
user's edits, and an existing cover-letter guide SHALL be regenerated in the
new language with the prior-language guide removed. Artifacts that do not yet
exist SHALL adopt the new language when they are later created.

If the application already has a cover-letter guide, the system SHALL first
ask the user to confirm the change — naming that the existing letter will be
regenerated and replaced, and that the CV will be re-tailored with edits
kept — before regenerating anything. If the application has no cover-letter
guide (a CV-only change), the system SHALL proceed immediately without asking
for confirmation.

While the re-generation runs, the control SHALL indicate progress, and a
failure SHALL be surfaced inline without discarding the artifacts that
succeeded.

#### Scenario: Both artifacts follow the new language

- **WHEN** an application has both a CV and a letter in English and the user
  switches the language control to Dutch and confirms the change
- **THEN** the CV is re-tailored to Dutch keeping the user's edits
- **AND** the letter is regenerated in Dutch and the English letter is removed
- **AND** both tabs display the Dutch versions

#### Scenario: Only the existing artifact is regenerated

- **WHEN** an application has a CV but no letter and the user changes the
  language
- **THEN** the CV is re-generated in the new language immediately, with no
  confirmation step
- **AND** the letter, when later created, is generated in the new language

#### Scenario: Confirmation is required before an existing letter is replaced

- **WHEN** an application has a cover-letter guide and the user selects a
  different language
- **THEN** a confirmation prompt appears explaining that the letter will be
  regenerated and replaced and the CV re-tailored with edits kept
- **AND** no regeneration starts until the user confirms

#### Scenario: Declining the confirmation makes no changes

- **WHEN** the confirmation prompt is shown and the user declines or dismisses
  it
- **THEN** the language control keeps its previous value
- **AND** the existing CV and letter are unchanged

#### Scenario: Failure is reported without data loss

- **WHEN** re-generation for a language change fails
- **THEN** an inline error is shown
- **AND** the previously generated artifacts remain available
- **AND** the language control reverts so re-selecting the language retries
  only the artifacts still in the old language
