## ADDED Requirements

### Requirement: Filter decisions remain legible

Openings the filter set aside, and openings the user rejected, SHALL remain
fully legible: the AI's stated reason and every other text element on those
rows SHALL meet the WCAG AA contrast minimum (4.5:1 for body text) against
their background. The system SHALL NOT convey "filtered out", "rejected", or
"decided" by reducing the opacity of the row or its text.

Decided state SHALL instead be conveyed structurally — by the row's background
surface together with a verdict icon and a text label naming the decision — so
that the state is never signalled by colour or opacity alone.

#### Scenario: A filtered-out opening's reason is readable

- **WHEN** the filtered-out list shows an opening the filter judged off-target
- **THEN** the filter's stated reason renders at full text contrast
- **AND** the row is distinguishable as decided by its background and its
  verdict label, not by being faded

#### Scenario: A rejected opening in history is readable

- **WHEN** history shows an opening the user rejected
- **THEN** its reason and details render at full text contrast
- **AND** a visible label names it as rejected

### Requirement: The appeal path is discoverable before it is needed

The Job Suggestions page SHALL make clear that openings the filter sets aside
are kept along with the filter's reason and can be restored, and SHALL do so
even when nothing has been filtered out yet. The explanation SHALL NOT be
conditional on the filtered-out list being non-empty.

#### Scenario: First run explains the filter is auditable

- **WHEN** a user has never had an opening filtered out
- **THEN** the page still states that non-matching openings are kept with their
  reason and can be brought back

#### Scenario: Filtered openings can be restored

- **WHEN** the filtered-out list contains an opening
- **THEN** that opening offers a control returning it to the suggestions list

### Requirement: Accepting a suggestion keeps the user in the triage queue

Accepting a suggestion SHALL NOT navigate the user away from the Job
Suggestions page. The accepted opening SHALL be marked as accepted in place,
SHALL indicate that its CV and cover-letter guide are being generated, and
SHALL offer an explicit control to open the resulting application.

Because accepting starts paid AI work, it SHALL offer an undo affordance
comparable to the one offered when rejecting.

#### Scenario: Accepting leaves the queue intact

- **WHEN** a user accepts a suggestion while several other suggestions are listed
- **THEN** the page stays on Job Suggestions with the remaining suggestions visible
- **AND** the accepted row shows that generation is under way
- **AND** a control is offered to open the resulting application

#### Scenario: Accepting can be undone

- **WHEN** a user accepts a suggestion
- **THEN** an undo affordance is offered for a short period

### Requirement: Scan and re-check status is announced in one place

While a scan or re-check runs, the page SHALL present its progress in a single
dedicated status region that is not nested inside any results list, so the
progress is visible regardless of which results exist or where the user has
scrolled. That region SHALL be exposed to assistive technology as a live status
region.

Controls that start long-running work SHALL keep a stable accessible name while
that work runs, rather than having their label replaced by progress text.

#### Scenario: Progress is visible with no results loaded

- **WHEN** a re-check is resumed and its openings have not finished loading
- **THEN** the status region still reports the re-check as running

#### Scenario: The start control keeps its name

- **WHEN** a scan is running
- **THEN** the control that started it still reads as the scan control and
  indicates it is busy
- **AND** the progress text is reported by the status region

### Requirement: Source errors are attributed to the correct source

When a scan or re-check cannot read a source, the failure SHALL be attributed
to that specific source, including when several sources share a hostname.
Stored source errors SHALL be cleared when a new scan or re-check begins, so a
failure never outlives the run that produced it.

#### Scenario: Two sources on one host fail independently

- **WHEN** two sources share a hostname and only one of them cannot be read
- **THEN** only the failing source is shown as failing

#### Scenario: A re-check clears stale errors

- **WHEN** a scan reported a source error and the user then starts a re-check
- **THEN** the previous run's error is no longer shown

### Requirement: Page regions form a navigable outline

Each titled region of the Job Suggestions page SHALL be marked up as a real
heading below the page title, so assistive-technology users can navigate the
page by its structure.

#### Scenario: Regions are headings

- **WHEN** a user navigates the page by headings
- **THEN** each titled region is reachable as a heading nested under the page title

## MODIFIED Requirements

### Requirement: A running scan is cancellable

The system SHALL expose an endpoint to cancel a running scan or re-check by its
scan id, returning 404 for an unknown id. Cancelling SHALL stop the scan loop
promptly — including interrupting an in-flight local-engine generation so the
engine is freed — and mark the scan status `cancelled`. Results already stored
before cancellation SHALL be kept. A cancelled scan SHALL NOT update the
last-scan timestamp used for the profile-changed nudge.

While a scan or re-check runs, the Job Suggestions page SHALL show a Cancel
control; cancelling SHALL quietly return the page to idle (no error toast) and
show any partial results. The Cancel control's presence SHALL depend only on
work being in progress, never on which results are currently listed, so it
cannot disappear while the work it cancels is still running.

#### Scenario: Cancel stops the scan and frees the engine

- **WHEN** a scan is running on the local engine and the user clicks Cancel
- **THEN** the server interrupts the in-flight generation within a short time
- **AND** the scan status becomes `cancelled`
- **AND** openings stored before the cancel remain visible

#### Scenario: Cancelling an unknown scan id

- **WHEN** the cancel endpoint is called with an unknown scan id
- **THEN** it returns 404

#### Scenario: Cancel survives an emptied result list

- **WHEN** a re-check restores the last remaining filtered-out opening, leaving
  that list empty while the re-check is still running
- **THEN** the Cancel control and the running status remain available

### Requirement: Accurate accept copy and readable layout

The suggestion card's accept control SHALL carry a short label, with its
tooltip stating that accepting generates both a CV and a cover-letter guide; no
copy on the page SHALL claim accept generates only a CV or reference the
retired CV-Generator page. The Accept/Reject controls SHALL be vertically centered
within the suggestion card. Text inputs on the page (source URL, check-a-job
URL, suggestion search) SHALL render with the same inner padding as other text
inputs in the app.

The accept control SHALL NOT be the page's accent-coloured action, so that the
accent marks a single next action rather than repeating once per suggestion.

The two URL inputs on the page — the source URL and the check-a-job URL — SHALL
be typed as URL inputs, and SHALL be presented so their different purposes
(watching a listing page versus judging one posting) are distinguishable.

#### Scenario: Accept copy names both artifacts

- **WHEN** a suggestion card is shown
- **THEN** its accept button shows a short label
- **AND** its tooltip indicates both a CV and a letter are generated

#### Scenario: Inputs are padded

- **WHEN** the user types in the source-URL or check-a-job input
- **THEN** the text does not touch the input's left border

#### Scenario: Accent is not repeated per card

- **WHEN** several suggestions are listed
- **THEN** no suggestion card carries the page's accent-coloured action

#### Scenario: URL inputs are typed

- **WHEN** the user focuses the source-URL or check-a-job input
- **THEN** the field behaves as a URL input
