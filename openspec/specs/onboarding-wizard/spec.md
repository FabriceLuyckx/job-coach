## Purpose

Defines the first-run setup wizard's behaviour: the visual vocabulary it borrows
from the rest of the app, its accessibility contract as a non-dismissable modal,
and how it reports long-running work (model download, on-device translation) so a
user is never told setup succeeded when it did not.

## Requirements

### Requirement: One selection vocabulary across the wizard

The first-run wizard SHALL indicate the currently-selected option with the same visual treatment on every step, and that treatment SHALL be the app's shared selected-fill state — the one used by `EngineCard`, `ModelRow`, and the `.seg` control, whose fill token is owned by the shell visual system (see the `app-shell-visual-system` spec, which reserves the accent for the primary action, the current selection, and the deadline signal). The wizard SHALL NOT invent a bespoke selection treatment such as a coloured selection border. Within a step, the accent SHALL NOT be spent on anything beyond the selected option and the single primary action (**Next**/**Finish**).

#### Scenario: Language option is selected

- **WHEN** the user picks a language on step 0
- **THEN** the chosen language button renders with the shared selected-fill state, not a coloured selection border
- **AND** no element on that step besides the selection and the primary **Next** button is drawn in the accent

#### Scenario: Selection looks identical on the engine step

- **WHEN** the user compares a selected language (step 0) with a selected engine card (step 1)
- **THEN** both use the same selected-fill treatment, so "selected" reads the same way throughout the wizard

#### Scenario: A shell palette change does not fork the wizard

- **WHEN** the shell's selected-fill token changes (as in a redesign)
- **THEN** the wizard's selected options change with it, because it reuses the shared controls rather than restating a colour of its own

### Requirement: Accessible, non-dismissable dialog

The wizard overlay SHALL be exposed as a modal dialog: it MUST carry `role="dialog"` and `aria-modal="true"`, be labelled by the visible step heading (`aria-labelledby`), move keyboard focus into the dialog when it opens and again whenever the step changes, and trap Tab/Shift-Tab focus within the dialog. It SHALL remain non-dismissable — neither Escape nor a backdrop click closes it — because an app without a configured AI engine cannot function.

#### Scenario: Screen reader announces the dialog

- **WHEN** a screen-reader user reaches the open wizard
- **THEN** it is announced as a modal dialog labelled by the current step's heading

#### Scenario: Focus stays inside the wizard

- **WHEN** a keyboard user tabs to the last focusable control and presses Tab (or Shift-Tab from the first)
- **THEN** focus wraps within the dialog and never lands on the obscured app behind it

#### Scenario: Focus moves on step change

- **WHEN** the user advances from one step to the next
- **THEN** focus moves into the newly-shown step (e.g. its heading or first control) rather than being left on a control that no longer exists

#### Scenario: Wizard cannot be dismissed without setup

- **WHEN** the user presses Escape or clicks the backdrop
- **THEN** the wizard stays open, and it closes only when an AI engine is working and the flow is completed

### Requirement: Styled confirmation dialogs, no native dialogs

The wizard SHALL use the shared `ConfirmModal` for any confirmation (including the RAM-override prompt when a chosen local model exceeds available memory) and SHALL NOT use the browser's native `window.confirm`/`alert`, so the first-run experience stays within the app's visual system.

#### Scenario: RAM override is confirmed in-system

- **WHEN** a local-model download is blocked by the RAM pre-check and the user is offered to proceed
- **THEN** the choice is presented via the styled `ConfirmModal`, not a native browser dialog

### Requirement: Reassuring download progress

While a local model downloads, the wizard SHALL show absolute progress (bytes/GB done out of total) alongside the percentage, and SHALL set the expectation that the download can take several minutes. The progress bar SHALL match the app's Settings treatment (bordered, ink fill).

#### Scenario: Download shows size and expectation

- **WHEN** a local model is downloading during onboarding
- **THEN** the wizard shows GB done / total and the percentage, plus a hint that it can take a few minutes
- **AND** the progress bar has a 1px ink border and an ink fill, matching Settings

### Requirement: No silent failure of on-device translation

When the user chooses a non-shipped ("Other") language, the wizard SHALL NOT close claiming success while silently swallowing a translation failure. It MUST either surface the translation job's progress/failure to the user or explicitly defer the outcome to Settings, so a failed translation never leaves the user in an unexpected language with no explanation.

#### Scenario: Translation failure is surfaced

- **WHEN** the on-device translation for an "Other" language fails to start or complete
- **THEN** the user is informed (in the wizard or via a clear pointer to Settings) rather than being told everything is set up

### Requirement: Progress and copy polish

The wizard SHALL show step progress with a visible 3-segment indicator (not text alone), SHALL localize all user-facing strings including the "Other language" code input placeholder, and SHALL NOT retain unused i18n keys for the flow.

#### Scenario: Step progress is visible

- **WHEN** the user is on any step of the wizard
- **THEN** a 3-segment indicator shows which step of three they are on, in addition to any text label

#### Scenario: Placeholder is localized

- **WHEN** the "Other language" code input is shown
- **THEN** its placeholder text comes from the i18n catalog, not a hardcoded string
