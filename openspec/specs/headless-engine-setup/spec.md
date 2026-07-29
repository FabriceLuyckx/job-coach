# headless-engine-setup

## Purpose

The packaged app's one-time headless-browser (Chromium) download: what the
setup banner tells the user it affects, and how the install subprocess stays
runnable and diagnosable in windowed (no-console) builds.

## Requirements

### Requirement: The setup banner names everything that depends on the browser engine

While the packaged app's one-time browser-engine (Chromium) download is running
or has failed, the setup banner SHALL name reading job pages as affected
alongside PDF export. It SHALL NOT claim that everything except PDF export
works while the engine is missing.

#### Scenario: Download in progress

- **WHEN** the first-run Chromium download is still running
- **THEN** the banner says the download affects reading job pages and PDF
  export, and that it is one-time

#### Scenario: Download failed

- **WHEN** the Chromium download failed
- **THEN** the banner's error state says job-page reading and PDF export won't
  work until it is resolved

### Requirement: The engine installer runs and is diagnosable in windowed builds

The Chromium install subprocess SHALL NOT inherit the parent process's standard
I/O handles (absent in a windowed, no-console build): its stdin SHALL be
detached and its output SHALL be written to the app log file, so an install
failure in a packaged app leaves a readable trace.

#### Scenario: Install in a no-console Windows build

- **WHEN** the packaged windowed app runs the first-run Chromium install
- **THEN** the installer child process runs without valid inherited console
  handles being required

#### Scenario: Install failure is diagnosable

- **WHEN** the Chromium install fails (e.g. proxy or antivirus interference)
- **THEN** the installer's output is present in the app log file
