# cv-skills Specification

## Purpose
TBD - created by archiving change controllable-cv-skills. Update Purpose after archive.

## Requirements

### Requirement: The AI selects the skills relevant to the job

The tailoring plan SHALL carry the profile skills the model judged irrelevant to the job, and
the CV SHALL render without them. A skill group left with no visible skills SHALL be omitted
entirely rather than printing an empty heading, and a CV with no visible skills at all SHALL
omit the skills section. The profile SHALL NOT be modified — it remains the full set every CV is
drawn from, and other CVs are unaffected.

#### Scenario: Irrelevant skills stay off the CV

- **WHEN** a CV is tailored for a job and the model marks some profile skills irrelevant
- **THEN** the CV renders without them and with every other profile skill
- **AND** the profile and every other CV still list them

#### Scenario: A whole group can go

- **WHEN** the model marks every skill of one group irrelevant
- **THEN** that group's heading does not appear on the CV
- **AND** the remaining groups render unchanged

#### Scenario: Selecting nothing changes nothing

- **WHEN** the model marks no skill irrelevant
- **THEN** every profile skill appears on the CV

### Requirement: The model can only name skills that exist

The choice offered to the model SHALL be constrained to the profile's exact skill strings —
enumerated per call, as the tailoring plan already does for translatable strings — so that a
skill outside the profile cannot be named. A name that nonetheless fails to resolve to a profile
skill SHALL be ignored, leaving that skill on the CV; a selection that would leave the CV with
no skills at all SHALL be ignored in full rather than silently emptying the section.

#### Scenario: An unknown skill name cannot remove anything

- **WHEN** a model response names a skill that is not in the profile
- **THEN** no profile skill is removed on account of it
- **AND** the CV renders without error

#### Scenario: A degenerate selection is refused

- **WHEN** a model response marks every profile skill irrelevant
- **THEN** the response is ignored and the CV renders with the skills section intact

#### Scenario: A skill deleted from the profile stops mattering

- **WHEN** a skill a CV excluded is later removed from the profile
- **THEN** the CV renders without error and without that skill

### Requirement: The user overrides the selection in both directions

The CV editor SHALL show every profile skill in its group, distinguishing the ones on the CV,
the ones the user removed, and the ones the AI left out, and SHALL let the user reverse any of
those in one action. Each group SHALL additionally carry one control that takes the whole group
off the CV or puts it back — including every skill of it the AI dropped. Neither direction SHALL
modify the profile.

#### Scenario: Restoring a skill the AI dropped

- **WHEN** the user restores a skill from the AI's left-out list
- **THEN** the CV re-renders with that skill in its group
- **AND** it is no longer listed as left out

#### Scenario: Removing a skill the AI kept

- **WHEN** the user unticks a skill shown on the CV
- **THEN** the CV re-renders without it, and the profile is unchanged

#### Scenario: Taking a whole group off the CV

- **WHEN** the user turns a group off
- **THEN** none of its skills appear on the CV and the group prints no heading
- **AND** turning it back on returns all of them in one action, the AI's leftovers included

### Requirement: Skill choices survive as the CV changes

The plan's skill choices SHALL be stored with that CV, per language, and applied on every
subsequent render. When a CV is re-tailored into another language, the choices SHALL carry into
the new language's plan rather than resetting to a fresh model selection — they describe the
application, not its prose, and skill names are not translated. Regenerating a CV while keeping
edits SHALL keep the user's choices; regenerating without keeping edits SHALL discard them along
with the other edited content.

#### Scenario: Choices persist across renders

- **WHEN** the user restores one skill and removes another, then reopens the CV later
- **THEN** the same skills are on the CV

#### Scenario: Language change keeps the choices

- **WHEN** a CV with user-adjusted skills is re-tailored into another language
- **THEN** the new language's CV shows the same skills

#### Scenario: Regenerating without keeping edits re-selects

- **WHEN** the user regenerates the CV and chooses not to keep edits
- **THEN** the CV shows the model's fresh selection and the user's adjustments are gone

### Requirement: The CV marks no skill as emphasised

Skill highlighting SHALL be removed. No CV SHALL render a skill with AI-chosen emphasis, and the
model SHALL NOT be asked for one — an emphasis the user could neither see the reason for nor
change has no place on a document going out over their name. Selection, which the user does
control, is the whole of what the model decides about skills.

#### Scenario: No emphasis is rendered

- **WHEN** a CV is rendered with any built-in template
- **THEN** every visible skill of a group renders alike, in the profile's own order
- **AND** no skill carries an emphasis mark

#### Scenario: An older plan's stored emphasis is inert

- **WHEN** a CV whose stored plan still carries a highlight list is re-rendered
- **THEN** it renders without error and without any emphasis mark
