# page-reading

## ADDED Requirements

### Requirement: A rendered page that loaded is never discarded for failing to go network-idle

The headless render SHALL treat network idleness as a best-effort settle, not a
success condition: after the document has loaded, it SHALL wait a bounded time
for the network to go idle and then return the page content that is present,
whether or not idleness was reached. Genuine navigation failures (DNS,
connection refused, HTTP-level navigation errors) SHALL still raise so callers
can fall back or report.

#### Scenario: Chatty SPA posting page is read

- **WHEN** a posting page keeps background network traffic running indefinitely
  (analytics, polling) but its content has rendered
- **THEN** the render returns the page's HTML with the posting text in it
- **AND** no timeout error is raised or shown to the user

#### Scenario: Unreachable page still fails

- **WHEN** the URL's host cannot be resolved or refuses the connection
- **THEN** the render raises, and the caller's existing fallback/error path runs

#### Scenario: Page times out before any content

- **WHEN** the document itself never finishes loading within the navigation timeout
- **THEN** the render raises or returns near-empty HTML
- **AND** downstream minimum-text/minimum-links guards treat it as unreadable

### Requirement: PDF rendering does not fail on unreachable remote fonts

CV PDF rendering SHALL tolerate remote font requests that hang or are blocked
(e.g. a proxy blackholing the font CDN): after a bounded wait it SHALL produce
the PDF with fallback fonts rather than raising.

#### Scenario: Font CDN blackholed by a proxy

- **WHEN** the CV HTML references a remote font and that request never completes
- **THEN** PDF export still returns a PDF (in fallback fonts) instead of an error
