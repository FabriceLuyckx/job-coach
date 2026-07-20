## Purpose

Defines the visual-contrast and colour-usage rules for the app shell (the
teal `--frame` wall, sidebar, footer) and the shared design tokens it draws
on — accessibility (WCAG AA), the teal ramp, elevation shadows, and accent
usage — so shell chrome stays legible and the token system stays
unambiguous as pages are added.

## Requirements

### Requirement: Shell text meets WCAG AA against the wall

Every persistent text element rendered on the app shell background (`--frame`)
SHALL meet WCAG 2.1 AA contrast against that background: at least **4.5:1** for
text below 18px or non-bold, and at least **3:1** for large text and for
non-text UI components that carry state.

This covers the sidebar wordmark, sidebar navigation links in their inactive,
hover and active states, and the application footer including the AGPL §13
source link. The footer link is load-bearing for licence compliance — an offer
of source that cannot be read does not discharge the obligation.

#### Scenario: Inactive navigation link is legible

- **WHEN** the sidebar renders a navigation link that is not the current route
- **THEN** its computed text colour contrasts at ≥4.5:1 against `--frame`

#### Scenario: Footer and AGPL link are legible

- **WHEN** the app footer renders its attribution text and the GNU AGPL v3 link
- **THEN** both contrast at ≥4.5:1 against `--frame`

#### Scenario: Wordmark survives the wall

- **WHEN** the sidebar wordmark renders, including its emphasised second word
- **THEN** every glyph contrasts at ≥4.5:1 against `--frame`, with no portion
  relying on `--ink` (which is indistinguishable from a dark wall)

#### Scenario: Active route is distinguishable without relying on the accent

- **WHEN** a navigation link is the current route
- **THEN** it is marked by a `--paper` fill with `--ink` text at ≥4.5:1, and its
  distinction from inactive links does not depend on any element that falls
  below 3:1 against `--frame`

### Requirement: Teal is one ramp with three assigned values

The design system SHALL define teal as a single hue at three values, each with a
distinct and documented job: a **wall** value for the app shell, a **content**
value for AI and success signals, and a **tint** value for soft backgrounds. No
two teal tokens may exist whose relationship is undocumented, and no teal token
may require prose instructing authors not to use it in particular contexts.

#### Scenario: Ramp is documented in DESIGN.md

- **WHEN** DESIGN.md's Colors section is read
- **THEN** the three teal values appear as one ramp with a stated role each, and
  the previous "keep it out of in-page UI" warning on the shell colour is absent

#### Scenario: Content teal is unchanged

- **WHEN** an AI badge, success message, or success state renders
- **THEN** it uses the content teal `#2F6B66`, unchanged by this change

### Requirement: Elevation reads against its own ground

A floating element's shadow SHALL be perceivable against the surface it floats
above. The system provides one shadow value per ground: the existing
ink-on-cream value for elements floating above the page sheet (modals, menus),
and a distinct darker value for the page sheet floating above the wall.

A shadow whose contrast against its own ground falls below 1.2:1 is not
perceivable and does not satisfy this requirement.

#### Scenario: Page sheet casts a visible shadow on the wall

- **WHEN** `.page-container` renders against `--frame`
- **THEN** its shadow contrasts at ≥1.2:1 against `--frame`

#### Scenario: Modal and menu shadows are unchanged

- **WHEN** a modal, dropdown, or add-section menu renders above the cream sheet
- **THEN** it uses the existing `--shadow-pop` value, unmodified

### Requirement: The accent is spent only on the primary signal

Vermilion (`--accent` / `--accent-text`) SHALL mark at most the primary action,
the current selection, and state indicators within a given view. It SHALL NOT be
applied wholesale by element type.

In-content hyperlinks are styled with `--ink` plus an underline, not the accent.
The accent remains available to a link that *is* the view's next action.

#### Scenario: Ordinary content links are not accent-coloured

- **WHEN** a link renders inside page content — a job title, a source name, a
  posting link
- **THEN** it renders in `--ink` with a visible underline, and its accessible
  affordance does not depend on colour alone

#### Scenario: Accent count stays within the rule on a dense page

- **WHEN** the Job Suggestions page renders with sources, suggestions, filtered
  rows and history all populated
- **THEN** the elements drawn in vermilion are limited to the primary action
  button, the active navigation tab, and deadline chips

#### Scenario: A call-to-action link may keep the accent

- **WHEN** a link is the single primary next action of its view, such as the
  Preferences end-card link
- **THEN** it may use `--accent-text`, subject to the one-primary-signal rule
