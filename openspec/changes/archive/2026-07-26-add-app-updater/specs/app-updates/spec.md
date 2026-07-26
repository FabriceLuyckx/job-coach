## ADDED Requirements

### Requirement: Update availability check

The application SHALL be able to determine whether a newer release than the one
it is running has been published, by reading the project's latest published
GitHub Release and comparing its version tag against the running application
version. The check SHALL report the newer version, a link to its release notes,
and whether an installable asset exists for the current platform.

#### Scenario: A newer release exists

- **WHEN** the latest published release's version is greater than the running version
- **THEN** the check reports that an update is available
- **AND** it reports the new version number and a link to that release

#### Scenario: The app is already current

- **WHEN** the latest published release's version equals or is older than the running version
- **THEN** the check reports that no update is available

#### Scenario: The running version cannot be determined

- **WHEN** the running application version is unknown or not a comparable version number
- **THEN** the check reports that no update is available rather than guessing
- **AND** it does not offer to install anything

#### Scenario: The release has no asset for this platform

- **WHEN** a newer release exists but publishes no installable asset for the running platform
- **THEN** the check reports the update as available but not installable in place
- **AND** it directs the user to the release page

#### Scenario: The check cannot reach the release host

- **WHEN** the release host is unreachable or returns an error
- **THEN** the check reports a failure without disrupting the rest of the application

### Requirement: Automatic start-up check with user control

The application SHALL check for updates automatically when it starts, and SHALL
provide a persisted setting that disables this automatic check. The setting SHALL
default to enabled. When automatic checking is disabled, no update request SHALL
be made unless the user asks for one explicitly.

#### Scenario: Automatic check finds an update

- **WHEN** the application starts with automatic checking enabled and a newer release exists
- **THEN** the user is informed that an update is available, without interrupting their work

#### Scenario: Automatic check is disabled

- **WHEN** the application starts with automatic checking disabled
- **THEN** no update check is performed
- **AND** the user is not shown any update notice

#### Scenario: Disabling automatic checks persists

- **WHEN** the user turns off automatic update checks in settings
- **THEN** the preference is stored
- **AND** it still applies after the application is restarted

### Requirement: Manual update check

The application SHALL provide a user-initiated update check that runs regardless
of the automatic-check setting, and SHALL report its outcome — update available,
already current, or check failed — explicitly.

#### Scenario: User checks and an update exists

- **WHEN** the user triggers a manual check and a newer release exists
- **THEN** the new version and its release notes link are shown
- **AND** the user is offered the option to install it

#### Scenario: User checks while already current

- **WHEN** the user triggers a manual check and no newer release exists
- **THEN** the user is told the application is up to date

#### Scenario: Manual check works with automatic checks off

- **WHEN** automatic checking is disabled and the user triggers a manual check
- **THEN** the check still runs and reports its result

### Requirement: Update installs only on explicit approval

The application SHALL NOT download or install an update without the user
explicitly approving that specific update. Being informed of an available update
SHALL NOT by itself start any download or replacement.

#### Scenario: Notice alone changes nothing

- **WHEN** the user is informed an update is available but takes no action
- **THEN** nothing is downloaded and the installed application is unchanged

#### Scenario: Approval starts the update

- **WHEN** the user approves the offered update
- **THEN** the application downloads and installs that version

#### Scenario: User dismisses the notice

- **WHEN** the user dismisses the update notice
- **THEN** the notice stops being shown for the current session
- **AND** no update is installed

### Requirement: Supervised download with progress and cancellation

While an approved update downloads, the application SHALL show its progress and
SHALL allow the user to cancel. A cancelled or failed download SHALL leave the
installed application untouched.

#### Scenario: Download progress is visible

- **WHEN** an approved update is downloading
- **THEN** the user can see how much has been transferred relative to the total

#### Scenario: User cancels mid-download

- **WHEN** the user cancels a download in progress
- **THEN** the download stops
- **AND** the installed application is unchanged and still usable

#### Scenario: Download fails or is truncated

- **WHEN** the download errors out or completes with fewer bytes than the release asset declares
- **THEN** the update is abandoned with an error the user can read
- **AND** the installed application is not replaced

### Requirement: Safe replacement of the installed application

The application SHALL replace itself only after the downloaded update has been
fully staged, and SHALL preserve the existing installation until the replacement
is verified in place, so that a failure at any step leaves a working application.
The application SHALL exit before its own files are replaced and SHALL be
relaunched afterwards.

#### Scenario: Successful replacement

- **WHEN** a staged update is installed
- **THEN** the running application exits
- **AND** the installed application is replaced by the new version and relaunched

#### Scenario: Replacement fails partway

- **WHEN** copying the staged update over the installation fails
- **THEN** the previous installation is restored
- **AND** the user is left with a working application

#### Scenario: User data survives the update

- **WHEN** an update is installed
- **THEN** the user's profile, generated documents, job database, settings, downloaded AI model, and downloaded browser are all preserved

### Requirement: Refusal when self-update cannot be safe

The application SHALL refuse to replace itself when the installation cannot be
safely updated in place, and SHALL explain why and offer the release page as the
alternative. Refusal conditions SHALL include at minimum: running from a source
checkout rather than a packaged install, an installation directory the running
process cannot write to, and a macOS bundle running from a read-only or
translocated location rather than a real installed path.

#### Scenario: Running from a source checkout

- **WHEN** an update install is requested while running from a source checkout
- **THEN** the application declines to self-update and explains that the source checkout is updated with version control instead

#### Scenario: Installation directory is not writable

- **WHEN** the installation directory cannot be written to by the running process
- **THEN** the application declines to self-update and tells the user to install the update manually, linking the release

#### Scenario: macOS app is running translocated

- **WHEN** the macOS application is running from a translocated or read-only location rather than an installed path
- **THEN** the application declines to self-update and tells the user to move the application to Applications first

### Requirement: Update source is constrained to the project's releases

The application SHALL only download update payloads from the project's own
release host, and SHALL reject any asset location that does not originate there.
The URL used for download SHALL NOT be taken on trust from arbitrary response
content.

#### Scenario: Asset from the expected release host

- **WHEN** the chosen release asset is hosted on the project's own release host
- **THEN** it is downloaded

#### Scenario: Asset pointing elsewhere

- **WHEN** a release asset's download location points at any other host
- **THEN** the update is refused and nothing is downloaded or executed
