# job-feedback-learning

## Purpose

The job filter adapts to the user's real accept/reject choices: rejecting a
suggestion captures an optional free-text reason, and the whole accept/reject
history is distilled into a compact learned-preferences memo that steers future
match decisions — at bounded token cost and with no LLM call on the decision
action itself.

## Requirements

### Requirement: Rejecting captures an optional explanation

Rejecting a suggested opening SHALL let the user give an optional free-text
reason, without adding friction when they have none. Accepting SHALL remain a
single click with no prompt.

#### Scenario: Reject opens a note prompt

- **WHEN** the user clicks Reject on a suggested opening
- **THEN** a modal appears with an optional free-text field asking why they are
  rejecting it, plus confirm and cancel actions

#### Scenario: Rejecting with an empty note behaves like a plain reject

- **WHEN** the user confirms the reject modal without typing anything
- **THEN** the opening is marked rejected exactly as before and no note is stored

#### Scenario: The explanation is persisted

- **WHEN** the user confirms the reject modal with text entered
- **THEN** the text is stored on the opening in a field distinct from the LLM's
  audit reason, and survives reload

#### Scenario: Cancelling leaves the opening unchanged

- **WHEN** the user cancels the reject modal
- **THEN** the opening keeps its current status and no note is stored

#### Scenario: Accepting is unaffected

- **WHEN** the user clicks Accept on a suggested opening
- **THEN** the accept flow runs immediately with no modal or note prompt

### Requirement: The filter learns from the full accept/reject history

The system SHALL distil the user's entire accept/reject history into a single
compact learned-preferences memo, and the per-posting review SHALL take that memo
into account when judging a new opening, so mismatches the user has rejected are
less likely to be suggested and roles like ones they accepted are more likely to
surface.

#### Scenario: The memo informs a new verdict

- **WHEN** an opening is reviewed and the user has previously decided on other
  openings
- **THEN** the learned-preferences memo — summarising what the user has accepted
  and rejected across their whole history — is included in the review, alongside
  the profile and posting text

#### Scenario: The memo summarises all decisions, deduplicated

- **WHEN** the memo is built from many decisions, including repeated or similar
  rejections
- **THEN** it is a compact, deduplicated summary of the whole history rather than
  a verbatim list, and its length stays bounded regardless of how many decisions
  exist

#### Scenario: No decisions yet

- **WHEN** an opening is reviewed and the user has made no accept/reject decisions
- **THEN** the memo is empty, no learned-preferences context is included, and the
  verdict is produced as before

#### Scenario: Re-check and single-URL check use the same memo

- **WHEN** a filtered-out opening is re-checked, or a pasted URL is checked
- **THEN** the same learned-preferences memo informs the verdict

### Requirement: The memo is rebuilt only when decisions change

Maintaining the memo SHALL NOT add an LLM call to the reject or accept action,
and SHALL NOT rebuild the memo when nothing has been decided since it was last
built.

#### Scenario: Rejecting is instant

- **WHEN** the user confirms a reject (with or without a note)
- **THEN** the opening is marked rejected without any LLM call blocking the action

#### Scenario: Memo rebuilds at most once per scan after a new decision

- **WHEN** a scan or re-check runs and at least one opening has been accepted or
  rejected since the memo was last built
- **THEN** the memo is rebuilt once and cached for reuse

#### Scenario: No rebuild when nothing changed

- **WHEN** a scan runs and no opening has been decided since the memo was last
  built
- **THEN** the cached memo is reused and no rebuild LLM call is made

#### Scenario: Unchanged sources still cost nothing

- **WHEN** a scan runs and a source's link set is unchanged
- **THEN** that source is still skipped with zero LLM calls

### Requirement: Injected feedback is untrusted

The memo and any stored explanation SHALL be treated as untrusted content that
cannot direct the model beyond the constrained verdict.

#### Scenario: Injected text cannot issue instructions

- **WHEN** a stored explanation, the memo, or posting text contains
  instruction-like text
- **THEN** the review still returns only a verdict via the forced tool schema and
  the injected text cannot select any other action
