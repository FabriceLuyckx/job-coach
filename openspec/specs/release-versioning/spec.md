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

### Requirement: The version bump is unattended

Merging `main` into `stable` SHALL be the only human step in cutting a release.
The version-bump PR the automation raises SHALL be merged by the automation
itself, so the version is never a separate click; the push from that merge is what
triggers the tagging pass. Promoting `main` to `stable` SHALL remain a manual,
reviewed PR — the bookkeeping PR is unattended, the promotion is not.

#### Scenario: The release PR merges itself

- **WHEN** the automation has an open version-bump PR against the release branch
- **THEN** it merges that PR without waiting for a human
- **AND** the resulting push triggers the pass that creates the tag and release

#### Scenario: Promotion to the release branch stays human

- **WHEN** development work is promoted from `main` to `stable`
- **THEN** that promotion is a reviewed pull request, not an automated merge

### Requirement: Release automation runs on a credential that retriggers automation

The release chain hands off between workflows three times — bump PR merge → tag →
binary build — and each handoff depends on the *next* workflow starting from an
event the *previous* step created. The automation SHALL therefore act as a
credential whose events start workflow runs, rather than the CI system's default
token, which is defined not to trigger further workflow runs.

A release step SHALL NOT report success when the credential it needs is absent.
The workflow SHALL verify the credential is present before doing any release work
and SHALL fail loudly if it is missing, because a half-release that reports
success is the failure mode this requirement exists to prevent: with the default
token the tag push cut a release with no binaries, and the bump-PR merge cut no
tag at all while both runs reported green.

#### Scenario: Each handoff triggers the next workflow

- **WHEN** a release step creates an event another release workflow listens for (a branch push or a tag push)
- **THEN** that workflow starts

#### Scenario: A missing credential fails the run

- **WHEN** the release workflow runs without its configured automation credential
- **THEN** the run fails with a message naming the missing secret
- **AND** it does not proceed to bump, merge, tag, or publish anything

### Requirement: The released version reaches the development branch

The automation bumps the version on the release branch only. Because the running
application reads its version from that file, the development branch SHALL be
brought back in step with the release branch after every release, so work
continuing on `main` does not report a version one release behind.

#### Scenario: A release syncs back to main

- **WHEN** a release is created on the release branch
- **THEN** the release branch is merged back into `main`
- **AND** `main`'s `pyproject.toml` carries the released version

#### Scenario: An already-open sync does not fail the release

- **WHEN** a back-merge from a previous release is still open
- **THEN** the release run does not fail over the duplicate

#### Scenario: Binaries attach to the same release

- **WHEN** the `vX.Y.Z` tag is created
- **THEN** the binary build runs and attaches every published platform/architecture artifact to the existing release for that tag
- **AND** it does not create a second release for the same tag

### Requirement: Stable platform-identifying release asset names

Published release assets SHALL carry stable file names that identify their target
platform **and, where more than one architecture is published for that platform,
its architecture** — so an automated updater can select the correct asset for the
machine it runs on without guessing or parsing release prose. A name SHALL
distinguish every build a user could otherwise install on the wrong hardware. The
naming pattern SHALL NOT change between releases, and SHALL NOT embed the version
number, so that a single selection rule keeps working across releases.

When an additional architecture is introduced for an already-published platform,
the existing unsuffixed name SHALL keep denoting the architecture it denoted
before, and the new build SHALL take the suffixed name — so installs already in
the field keep resolving to the build they are running.

#### Scenario: Assets are selectable by platform and architecture

- **WHEN** a release publishes its platform binaries
- **THEN** each asset's file name identifies the platform it targets, and its architecture where the platform ships more than one
- **AND** the correct asset for a given platform+architecture can be chosen from the names alone

#### Scenario: A second architecture does not rename the first

- **WHEN** a platform that shipped a single build begins shipping a second architecture
- **THEN** the previously-published name still refers to the same architecture as before
- **AND** the newly-added architecture is published under its own distinct name

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
