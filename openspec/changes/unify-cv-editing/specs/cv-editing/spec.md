## ADDED Requirements

### Requirement: One editing surface, ordered like the CV

A generated CV SHALL be edited through a single surface listing one row per section the CV can
carry, in the order the rendered CV carries them. The list SHALL be derived from what the CV
actually renders — its `data-section` keys — unioned with the sections currently off it, so a
section gains a row whenever there is data behind it and never needs registering separately. A
row SHALL be present for every section the user or the model took off, so nothing can leave the
CV without leaving a way back. Editing SHALL NOT be split across a second panel or a second
container.

#### Scenario: The list mirrors the rendered CV

- **WHEN** the user opens a generated CV
- **THEN** the editor lists its sections in the order the CV renders them

#### Scenario: A section added by a template needs no editor change

- **WHEN** a CV renders a section the editor has never shown before
- **THEN** that section appears as a row with its own on/off control

#### Scenario: A section off the CV keeps its row

- **WHEN** a section is off the CV, whether the user or the model took it off
- **THEN** it is still listed, and can be put back from its row

### Requirement: A section's presence and its content are one row

Each row SHALL carry the control deciding whether that section is on the CV. A row whose section
has editable content SHALL expand to it in place, and SHALL NOT surface that content anywhere
else: the professional summary expands to its text and the action that rewrites it with AI, the
experience section expands to its per-role bullet editors, and the skills section expands to the
skill controls the `cv-skills` capability defines. A row whose section has no editable content
SHALL be the control alone. Turning a section off SHALL NOT discard the content edited inside it.

#### Scenario: Editing a section's text

- **WHEN** the user expands the summary row
- **THEN** the summary text is editable there, together with the action that rewrites it with AI

#### Scenario: One place per section

- **WHEN** the user looks for a section's on/off control and its content
- **THEN** both are on that section's row and nowhere else

#### Scenario: A section with nothing to edit

- **WHEN** a section carries no editable content
- **THEN** its row offers its on/off control and does not expand

#### Scenario: Turning a section off keeps its edits

- **WHEN** the user turns off a section they had edited, then turns it back on
- **THEN** their edited content is still there

### Requirement: One control puts a section back, whatever left it off

A section SHALL be off the CV either because the user removed it or because the model judged it
irrelevant to the job, and the row SHALL name which. Restoring SHALL be the same single action in
both cases, and SHALL clear whichever of the two took it off. Neither direction SHALL modify the
profile.

#### Scenario: Restoring a section the model dropped

- **WHEN** the user turns on a row marked as left out by the AI
- **THEN** the section renders on the CV and is no longer marked as left out

#### Scenario: Restoring a section the user removed

- **WHEN** the user turns on a row they had turned off
- **THEN** the section renders on the CV, by the same action as the previous scenario

#### Scenario: Provenance is legible

- **WHEN** sections are off the CV for both reasons
- **THEN** each row states which of the two applies to it

#### Scenario: The profile is untouched

- **WHEN** any section is turned off or back on
- **THEN** the profile is unchanged and other CVs are unaffected

### Requirement: One save state covers every edit

Every edit made on the surface — text, section presence, skill selection — SHALL be saved by the
same mechanism and reported by a single save state on the surface itself, so no edit is silently
persisted and no edit appears unsaved. A save failure SHALL be surfaced there rather than only on
the edit that triggered it. Leaving the CV with an edit still pending SHALL persist it.

#### Scenario: Toggling a section reports its save

- **WHEN** the user turns a section off
- **THEN** the surface reports the save in progress and then that it saved

#### Scenario: One state for every kind of edit

- **WHEN** the user edits text, then a section, then a skill
- **THEN** each is reported by the same save state, in the same place

#### Scenario: A failed save is visible

- **WHEN** a save fails
- **THEN** the surface reports the failure

#### Scenario: A pending edit survives leaving

- **WHEN** the user closes the CV while an edit has not yet been saved
- **THEN** the edit is persisted

### Requirement: The surface is operable and legible without sight

The editing surface SHALL be navigable and understandable through assistive technology, not only
visually. Its sections SHALL form a heading outline that does not skip a level from its
surroundings. Every control SHALL carry an accessible name — including each editable field, whose
visible label SHALL be programmatically associated with it rather than merely placed above it.
The save state and the progress of any long-running AI action SHALL be announced when they
change. Why a section or skill is off the CV SHALL be conveyed in text, not by strike-through,
dashed outline, or colour alone. Every control SHALL meet the minimum target size, counting the
spacing exception only where the spacing actually earns it. An error SHALL be announced when it
appears.

#### Scenario: The surface has an outline

- **WHEN** a screen-reader user lists the headings of an open CV
- **THEN** the editing surface and its expandable sections appear as headings, at levels that do
  not skip

#### Scenario: Every field is named

- **WHEN** focus reaches an editable field on the surface
- **THEN** its visible label is announced as that field's name

#### Scenario: The save state is announced

- **WHEN** an edit is saved, or fails to save
- **THEN** the change of state is announced without the user moving focus

#### Scenario: A long AI action is announced

- **WHEN** the CV is being regenerated
- **THEN** that it is in progress, and that it finished, are both announced

#### Scenario: Provenance does not depend on seeing it

- **WHEN** a section or skill is off the CV
- **THEN** which of the user and the AI took it off is available as text, not only as a visual
  treatment

#### Scenario: Controls are big enough to hit

- **WHEN** any control on the surface is measured
- **THEN** it meets the minimum target size, or is spaced far enough from its neighbours to be
  exempt

### Requirement: An edit and its effect share a viewport

The editing surface SHALL sit above the CV preview, so that an expanded row is adjacent to the
preview rather than separated from it by the preview's full height. Collapsed, the surface SHALL
be a compact list, so the preview remains reachable without scrolling past a wall of controls.
Every edit SHALL be reflected in the preview once saved, and a change to a section's presence
SHALL be reflected immediately rather than waiting for the save.

#### Scenario: The preview follows an edit

- **WHEN** the user edits a bullet and the edit is saved
- **THEN** the preview re-renders with it

#### Scenario: A visibility change is immediate

- **WHEN** the user turns a section off
- **THEN** the preview stops showing it at once, without waiting for the save

#### Scenario: The surface is compact when nothing is expanded

- **WHEN** the user opens a CV and expands nothing
- **THEN** the surface is a list of rows, not the content of every section

### Requirement: Refreshing the preview keeps the reader's place

Reflecting an edit SHALL NOT cost the user their position in the CV: where the preview must be
re-rendered, the reader's scroll position SHALL be restored. An edit whose effect is already
applied to the preview SHALL NOT trigger a re-render at all.

#### Scenario: Scroll survives a text edit

- **WHEN** the user has scrolled to the second page of the preview and edits a bullet there
- **THEN** the refreshed preview is still showing that part of the CV

#### Scenario: A visibility change costs no re-render

- **WHEN** the user turns a section off or back on
- **THEN** the preview reflects it without re-rendering the document
