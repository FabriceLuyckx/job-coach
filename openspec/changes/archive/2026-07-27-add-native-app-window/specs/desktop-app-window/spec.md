## ADDED Requirements

### Requirement: The packaged app runs in its own window

The packaged desktop application SHALL present its interface in a native
application window owned by the application's own process, so that the running
app appears in the operating system's Dock/taskbar under the application's own
name and icon rather than the web browser's.

The window SHALL be resizable, SHALL open at a size that fits the app's normal
layout on a laptop screen, and SHALL restore to a usable size on a small
display.

#### Scenario: Launching the packaged app

- **WHEN** the user double-clicks the packaged application
- **THEN** a window titled with the application name opens showing the app's
  interface
- **AND** no browser tab is opened
- **AND** the Dock/taskbar entry for the running app shows the application's
  own icon

#### Scenario: Development run is unaffected

- **WHEN** a developer runs the backend directly with uvicorn from source
- **THEN** no application window is created and the app remains reachable in a
  browser at the local address, exactly as before

### Requirement: Closing the window quits the application

Closing the application window SHALL terminate the application, including its
local server, leaving no background process running.

The packaged application SHALL NOT rely on a terminal or console window as its
quit affordance.

#### Scenario: User closes the window

- **WHEN** the user closes the application window
- **THEN** the application process exits
- **AND** the local server stops accepting connections

#### Scenario: No console window on Windows

- **WHEN** the packaged application is launched on Windows
- **THEN** no console window is shown alongside the application window

### Requirement: Links that leave the app open in the system browser

Links whose destination is outside the application's own interface — external
web pages and any link the interface opens in a new tab — SHALL open in the
user's default browser rather than replacing or nesting inside the application
window.

#### Scenario: Opening an external link

- **WHEN** the user activates a link to an external site (for example a job
  listing, the source-code repository, or the AI provider's site)
- **THEN** the page opens in the user's default browser
- **AND** the application window continues to show the app's interface

#### Scenario: Opening a generated CV in a full tab

- **WHEN** the user chooses to open a generated CV preview outside the editor
- **THEN** it opens in the user's default browser
- **AND** the application window is unchanged

### Requirement: Downloading a generated PDF works in the app window

Downloading a generated CV as a PDF SHALL save a file to the user's normal
download location when triggered from inside the application window, without
requiring the browser.

The download SHALL be initiated by navigating to the server's PDF endpoint,
which already marks its response as an attachment; the client SHALL NOT
construct an in-memory object URL for this purpose, because the platform web
views cannot download from one.

#### Scenario: Downloading a PDF from the app window

- **WHEN** the user activates the PDF download control for a generated CV
- **THEN** the PDF is saved as a file with a name identifying the CV and its
  language
- **AND** the application window stays on the CV editor

#### Scenario: Downloading a PDF from a browser

- **WHEN** the user activates the same control while using the app in a
  browser
- **THEN** the PDF is downloaded exactly as before this change

### Requirement: The app falls back to the browser when no window backend exists

If a native window cannot be created — for example the platform's web view
runtime is missing — the application SHALL start its server and open the user's
default browser at the local address instead of failing to start, and SHALL
tell the user where the app is running.

#### Scenario: Web view runtime unavailable

- **WHEN** the packaged app starts on a machine with no usable web view runtime
- **THEN** the local server starts
- **AND** the user's default browser opens at the app's local address
- **AND** the user is informed how to reach and quit the app

### Requirement: A second launch does not start a second server

When the application is already running, launching it again SHALL NOT start a
second server on a new port; it SHALL surface the already-running instance and
exit.

#### Scenario: Launching while already running

- **WHEN** the user launches the application while an instance is already
  serving the app locally
- **THEN** no second server is started
- **AND** the user is brought to the already-running instance
