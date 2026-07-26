## ADDED Requirements

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
