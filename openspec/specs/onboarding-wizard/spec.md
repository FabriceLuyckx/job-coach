## Requirements

### Requirement: One selection vocabulary across the wizard

The first-run wizard SHALL indicate the currently-selected option with the same visual treatment on every step — the app's ink-fill selection (a filled ink background with cream text on the chosen option, mirroring `EngineCard`, `ModelRow`, and the `.seg` control) — and SHALL NOT use a colored accent border to convey selection. Vermilion SHALL remain rationed to the single primary action per step (the **Next**/**Finish** button), never spent on a selected choice.

#### Scenario: Language option is selected

- **WHEN** the user picks a language on step 0
- **THEN** the chosen language button renders with the ink-fill selected state (ink background, cream text), not a 2px accent border
- **AND** the only vermilion element on that step is the primary **Next** button

#### Scenario: Selection looks identical on the engine step

- **WHEN** the user compares a selected language (step 0) with a selected engine card (step 1)
- **THEN** both use the same ink-fill selected treatment, so "selected" reads the same way throughout the wizard

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
