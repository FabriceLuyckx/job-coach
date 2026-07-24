## Purpose

Give users a discoverable, reachable place to see the app's identity — name,
running version, license, and source — and act as the home for future
app-level (as opposed to page-level) actions.

## Requirements

### Requirement: App menu entry point

The system SHALL provide a persistent app-menu affordance in the sidebar
footer, distinct from the page navigation, whose first entry opens the About
modal. The affordance SHALL be positioned as the home for future app-level
actions (e.g. "Check for updates…") so additional sibling entries can be added
without relocating it.

#### Scenario: About is reachable from any page

- **WHEN** the user is on any page of the app
- **THEN** an "About" entry is visible in the sidebar footer
- **AND** activating it opens the About modal

#### Scenario: Keyboard accessible

- **WHEN** the user focuses the About entry with the keyboard and presses Enter or Space
- **THEN** the About modal opens and focus moves into it

### Requirement: About modal content

The About modal SHALL display the application name, the running version, a
one-line description, the license (AGPL-3.0-or-later) as a link to the license
text, the copyright notice, and a link to the source repository. The modal
SHALL reuse the shared `Modal` primitive (Escape and backdrop dismiss, focus
trap, focus return).

#### Scenario: Modal shows app identity and legal info

- **WHEN** the About modal is open
- **THEN** it shows the app name, version, description, copyright, a link to the
  AGPL-3.0 license text, and a link to the source repository

#### Scenario: Modal dismisses

- **WHEN** the About modal is open and the user presses Escape, clicks the
  backdrop, or activates the close control
- **THEN** the modal closes and focus returns to the About entry

### Requirement: Version reporting

The system SHALL expose the running application version through a read-only
backend endpoint, sourced from the project package metadata, as the single
source of truth the About modal displays.

#### Scenario: Version endpoint returns the app version

- **WHEN** a client requests the version endpoint
- **THEN** the response contains the current application version string

#### Scenario: Modal reflects the reported version

- **WHEN** the About modal opens
- **THEN** the version it shows matches the value returned by the version endpoint
