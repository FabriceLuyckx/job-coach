## Purpose

Automate application versioning end to end — from Conventional Commit
history to a bumped `pyproject.toml`, a tagged GitHub Release, and attached
platform binaries — so the version is never chosen or edited by hand.

## Requirements

### Requirement: Release branch as build source

The project SHALL maintain a long-lived `stable` branch as the sole source for
release builds. `main` SHALL remain the development branch. A release SHALL be
initiated only by merging `main` into `stable`; builds SHALL NOT be cut from
`main`.

#### Scenario: A release starts from a merge into stable

- **WHEN** development work on `main` is ready to release
- **THEN** it is merged into `stable`
- **AND** the release automation runs against `stable`, not `main`

#### Scenario: main is never the build source

- **WHEN** a binary release is produced
- **THEN** its commit is on the `stable` branch history
- **AND** no release artifact is built from `main`

### Requirement: Conventional-Commits-driven version bump

The system SHALL compute the next version automatically from the Conventional
Commits merged into `stable` since the previous release, following SemVer:
`feat:` SHALL yield a minor bump, `fix:` and other non-breaking types a patch
bump, and a `!` marker or `BREAKING CHANGE:` footer a major bump. The bump level
SHALL NOT be chosen manually.

#### Scenario: Feature commits produce a minor bump

- **WHEN** the commits since the last release include at least one `feat:` and no breaking change
- **THEN** the computed next version increments the minor component and resets patch to zero

#### Scenario: Only fixes produce a patch bump

- **WHEN** the commits since the last release contain only `fix:`/`chore:`-type changes
- **THEN** the computed next version increments the patch component

#### Scenario: Breaking change produces a major bump

- **WHEN** a commit since the last release carries a `!` marker or a `BREAKING CHANGE:` footer
- **THEN** the computed next version increments the major component and resets minor and patch to zero

### Requirement: Single version source of truth

The version SHALL be stored in exactly one place, `pyproject.toml`, which the
release automation updates and which the application reads at runtime. No other
tracked file SHALL be treated as the authoritative version.

#### Scenario: Version bump updates pyproject.toml

- **WHEN** the release automation computes a new version
- **THEN** it writes that version into `pyproject.toml`
- **AND** the running app's version endpoint reports the same value

### Requirement: Tag and release publication

When a computed release is accepted, the system SHALL create a `vX.Y.Z` git tag
and a corresponding GitHub Release with generated notes, and the existing
tag-triggered build SHALL attach the platform binaries to that release without
creating a duplicate release.

#### Scenario: Accepting a release tags and publishes it

- **WHEN** the release is accepted (the release PR is merged)
- **THEN** a `vX.Y.Z` tag is created matching the bumped `pyproject.toml` version
- **AND** a GitHub Release for that tag exists with generated notes

#### Scenario: Binaries attach to the same release

- **WHEN** the `vX.Y.Z` tag is created
- **THEN** the binary build runs and attaches the macOS and Windows artifacts to the existing release for that tag
- **AND** it does not create a second release for the same tag

### Requirement: Stable platform-identifying release asset names

Published release assets SHALL carry stable file names that identify their target
platform, so an automated updater can select the correct asset for the machine it
runs on without guessing or parsing release prose. The naming pattern SHALL NOT
change between releases, and SHALL NOT embed the version number, so that a single
selection rule keeps working across releases.

#### Scenario: Assets are selectable by platform

- **WHEN** a release publishes its platform binaries
- **THEN** each asset's file name identifies the platform it targets
- **AND** the correct asset for a given platform can be chosen from the names alone

#### Scenario: Naming stays stable across releases

- **WHEN** a later release is published
- **THEN** its assets use the same names as the previous release
- **AND** an updater's selection rule written against an earlier release still resolves correctly

### Requirement: Commit-convention guidance

The project SHALL guide contributors toward Conventional Commit subjects so the
version automation has a reliable signal, without hard-blocking commits. A
non-conventional subject SHALL produce a warning rather than a rejection.

#### Scenario: Non-conventional subject warns but commits

- **WHEN** a commit is made with a subject that is not a Conventional Commit
- **THEN** a warning is shown naming the expected format
- **AND** the commit still succeeds
