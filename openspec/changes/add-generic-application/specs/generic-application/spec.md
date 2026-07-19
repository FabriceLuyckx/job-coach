## ADDED Requirements

### Requirement: A single generic application pinned at the top

The Applications page SHALL present a generic application — a CV and
cover-letter guide aimed at the user's stated target roles rather than a
specific job posting — as the first item in the list, above every
listing-based application and below the New-application slot. At most one
generic application SHALL exist at a time.

The generic application SHALL NOT be sorted by creation date with the other
applications and SHALL NOT be hidden by the applications search filter.

#### Scenario: Pinned above listing applications

- **WHEN** a user opens the Applications page with several listing-based
  applications present
- **THEN** the generic application appears first in the list
- **AND** the listing-based applications follow, newest first

#### Scenario: Search does not hide it

- **WHEN** the user types a search query that matches none of the generic
  application's text
- **THEN** the generic application remains visible at the top

#### Scenario: Only one exists

- **WHEN** a generic application already exists
- **THEN** the page offers no action that would create a second one

### Requirement: Created only when the user triggers it

The generic application SHALL NOT be generated automatically. Until the user
triggers creation, the pinned card SHALL explain what a generic application is
and offer an explicit create action. Generation SHALL show progress and SHALL
be cancellable like every other generation on the page.

#### Scenario: Nothing is generated on page load

- **WHEN** a user opens the Applications page and has never created a generic
  application
- **THEN** the pinned card shows an explanation and a create action
- **AND** no AI call is made

#### Scenario: User triggers creation

- **WHEN** the user activates the create action
- **THEN** a generic CV and a generic cover-letter guide are generated
- **AND** progress and a Cancel control are shown while they run

### Requirement: Creation gated on profile readiness

The system SHALL allow creating the generic application only when the profile
contains enough information to aim it: at least one entry in
`preferences.target_roles` and at least one `experience` entry.

When the profile is not ready, the pinned card SHALL NOT offer the create
action; it SHALL instead name what is missing and link to the page where it is
filled in (Preferences for target roles, Profile for experience). The server
SHALL enforce the same gate and reject a creation request for an unready
profile with a clear error, so the gate does not depend on the client.

#### Scenario: No target roles

- **WHEN** the profile has experience but no target roles
- **THEN** the pinned card explains that target roles are needed and links to
  Preferences
- **AND** no create action is offered

#### Scenario: No experience

- **WHEN** the profile has target roles but no experience entries
- **THEN** the pinned card explains that at least one role in the work history
  is needed and links to Profile

#### Scenario: Server rejects an unready profile

- **WHEN** a creation request arrives while the profile is not ready
- **THEN** the request is rejected with an error naming the missing
  information
- **AND** no CV or letter row is created

#### Scenario: Ready profile enables creation

- **WHEN** the profile has at least one target role and at least one
  experience entry
- **THEN** the create action is offered

### Requirement: Generated from a profile role brief, not a posting

The generic CV and cover-letter guide SHALL be produced by the same tailoring
and guide pipelines used for listing-based applications, with the job posting
replaced by a **role brief** synthesized from the profile's preferences —
target roles, what the user is looking for, locations, working style, and
notes. No network fetch SHALL be performed for a generic application.

The resulting artifacts SHALL be labelled as generic (not as a posting at a
named employer), and the row SHALL NOT present a link to a job listing.

#### Scenario: No posting is fetched

- **WHEN** the generic application is generated
- **THEN** no job posting URL is fetched
- **AND** the tailoring input is the role brief built from the profile

#### Scenario: Row shows no listing link

- **WHEN** a user expands the generic application
- **THEN** no external job-listing link is shown

### Requirement: Behaves like any other application once created

Once created, the generic application SHALL support the same operations as a
listing-based one: CV | Letter tabs, the CV editor (summary, bullets, section
toggles), preview and PDF download, regeneration, language change, and
deletion with undo.

Any regeneration or language change of the generic application SHALL
re-synthesize the role brief from the **current** profile rather than reusing
a stored posting.

#### Scenario: Editing and exporting work

- **WHEN** a user opens the generic application's CV tab
- **THEN** the CV editor and PDF download are available exactly as for a
  listing-based CV

#### Scenario: Regeneration picks up profile changes

- **WHEN** the user updates their target roles and then regenerates the
  generic CV
- **THEN** the new brief reflects the updated preferences

#### Scenario: Deleting it restores the create action

- **WHEN** the user deletes the generic application
- **THEN** the pinned card returns to its create state
- **AND** an undo action is offered for the deletion
