## ADDED Requirements

### Requirement: Scan progress survives navigation

A running scan or re-check SHALL continue executing when the user navigates
away from the Job Suggestions page, and the page SHALL, on return, resume
displaying the running state and live progress of that scan rather than
appearing idle. When the scan finished while the user was away, returning
SHALL show its outcome (refreshed suggestions) without requiring a new scan.

#### Scenario: Returning to a running scan

- **WHEN** a scan is running and the user navigates to another page and back
- **THEN** the Job Suggestions page shows the scan as running with current progress
- **AND** the scan completes normally and its results appear

#### Scenario: Scan finished while away

- **WHEN** a scan completes while the user is on another page
- **THEN** returning to Job Suggestions shows the refreshed suggestions and an idle scan button

### Requirement: A running scan is cancellable

The system SHALL expose an endpoint to cancel a running scan or re-check by its
scan id, returning 404 for an unknown id. Cancelling SHALL stop the scan loop
promptly — including interrupting an in-flight local-engine generation so the
engine is freed — and mark the scan status `cancelled`. Results already stored
before cancellation SHALL be kept. A cancelled scan SHALL NOT update the
last-scan timestamp used for the profile-changed nudge.

While a scan or re-check runs, the Job Suggestions page SHALL show a Cancel
control; cancelling SHALL quietly return the page to idle (no error toast) and
show any partial results.

#### Scenario: Cancel stops the scan and frees the engine

- **WHEN** a scan is running on the local engine and the user clicks Cancel
- **THEN** the server interrupts the in-flight generation within a short time
- **AND** the scan status becomes `cancelled`
- **AND** openings stored before the cancel remain visible

#### Scenario: Cancelling an unknown scan id

- **WHEN** the cancel endpoint is called with an unknown scan id
- **THEN** it returns 404

### Requirement: Cancelled work is reused on the next attempt

The scan SHALL persist each opening's verdict (suggested or filtered-out) as
soon as it is determined, so that work completed before a cancellation is
stored. A subsequent scan SHALL NOT re-run the per-posting AI review for any
opening whose verdict was already stored, and SHALL review only the openings
that never received one. A source interrupted mid-scan SHALL be re-examined on
the next scan (its unchanged-links skip marker SHALL NOT be set by the
interrupted pass).

#### Scenario: Re-scan after cancel only pays for the remainder

- **WHEN** a scan reviewed 3 of a source's 5 new postings and was cancelled,
  and the user starts a new scan
- **THEN** the 3 reviewed postings keep their stored verdicts without a new AI review
- **AND** only the 2 remaining postings are reviewed

### Requirement: Per-source last-scanned visibility

The system SHALL record, per job source, when that source was last successfully
scanned (including scans where the source's link set was unchanged and the scan
skipped it early), and SHALL NOT update it when reading the source failed. The
source list SHALL show each source's last-scanned time, omitting it for sources
never scanned.

#### Scenario: Source shows its last-scanned time

- **WHEN** a scan processes a source successfully
- **THEN** the source's row in the source list shows the scan time

#### Scenario: Failed source keeps its old timestamp

- **WHEN** a scan cannot read a source
- **THEN** that source's last-scanned time is unchanged

### Requirement: Accurate accept copy and readable layout

The suggestion card's accept control SHALL carry a short label, with its
tooltip stating that accepting generates both a CV and a cover-letter guide; no
copy on the page SHALL claim accept generates only a CV or reference the
retired CV-Generator page. The Accept/Reject controls SHALL be vertically centered
within the suggestion card. Text inputs on the page (source URL, check-a-job
URL, suggestion search) SHALL render with the same inner padding as other text
inputs in the app.

#### Scenario: Accept copy names both artifacts

- **WHEN** a suggestion card is shown
- **THEN** its accept button shows a short label
- **AND** its tooltip indicates both a CV and a letter are generated

#### Scenario: Inputs are padded

- **WHEN** the user types in the source-URL or check-a-job input
- **THEN** the text does not touch the input's left border
