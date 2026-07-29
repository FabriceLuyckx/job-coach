# job-scan-lifecycle — delta

## MODIFIED Requirements

### Requirement: Source errors are attributed to the correct source

When a scan or re-check cannot read a source, the failure SHALL be attributed
to that specific source, including when several sources share a hostname.
Stored source errors SHALL be cleared when a new scan or re-check begins, so a
failure never outlives the run that produced it.

A failure of the AI engine SHALL NOT be attributed to sources: scans and
re-checks SHALL verify the engine is ready before reading any source and, when
it is not, fail the run once with a message naming the engine as the problem.
Whenever a source error is flattened into user-facing words, the raw exception
SHALL be written to the server log.

#### Scenario: Two sources on one host fail independently

- **WHEN** two sources share a hostname and only one of them cannot be read
- **THEN** only the failing source is shown as failing

#### Scenario: A re-check clears stale errors

- **WHEN** a scan reported a source error and the user then starts a re-check
- **THEN** the previous run's error is no longer shown

#### Scenario: Engine not ready fails the run once

- **WHEN** the AI engine cannot run (no key, local model missing or not loadable)
  and the user starts a scan or re-check
- **THEN** the run fails immediately with a message naming the AI engine
- **AND** no source is reported as unreadable

#### Scenario: Flattened errors keep their detail in the log

- **WHEN** a source fails during a scan and the UI shows a simplified reason
- **THEN** the raw exception for that source is in the server log
