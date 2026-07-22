## REMOVED Requirements

### Requirement: Shell text meets WCAG AA against the wall

**Reason**: The dark teal wall (`--frame` `#1E3A38`) is retired in Atelier. The app
becomes one drenched sage ground with the sidebar as a tonal step of that ground, so shell
chrome no longer sits on a dark surface and the "must not rely on `--ink`" constraint
inverts. Replaced by the light-sidebar AA requirement below, which carries the same
protections (nav legibility, footer + AGPL §13 link, active-route distinction) forward
against a light surface.

**Migration**: The sidebar becomes `color-mix(--ink 8%, --ground)` with `--ink`/`--muted`
text; the active route is a `--board` fill pill with `--heading` text. All shell text is
re-verified against the sage surface via `scripts/check_contrast.mjs`.

### Requirement: Teal is one ramp with three assigned values

**Reason**: Teal is removed entirely in Atelier. There is no teal wall, no teal signal,
and no teal tint. The match/success signal is now a single pine **marker** value
(`--mark`), and the ground is sage — a different hue system. A three-value teal ramp no
longer describes anything in the design.

**Migration**: Drop the `--teal`/`--teal-soft`/`--frame` teal tokens. AI/success/match
signals use `--mark` (`#1F5A44`); soft fills use `--board`/`--surface` tonal steps or
`--accent-soft`. DESIGN.md's Colors section documents the sage ground ramp and the marker
green in teal's place.

### Requirement: Elevation reads against its own ground

**Reason**: Atelier builds depth from tone, not shadow. The hard offset shadow, the
`--shadow-pop`/`--shadow-pop-wall` values, and the floating page sheet are all retired;
in-content surfaces separate by the `ground`/`board`/`surface` tonal steps plus
low-contrast hairlines. The perceivability-of-shadow rule is replaced by the tonal-depth
requirement below.

**Migration**: Remove drop-shadows from cards, panels, and rows. Only overlays
(modal/menu/toast) keep a single soft float shadow (see "Depth is tonal, not shadow").

## ADDED Requirements

### Requirement: The interface is one drenched tonal ground

The app SHALL present as a single drenched colour world rather than a light sheet floating
on a contrasting wall. The ground colour SHALL be defined as one hue at three documented
tonal values — a base (`--ground`), a raised panel (`--board`), and an input/inset surface
(`--surface`) — and the sidebar SHALL be a tonal step of that same ground, not a separate
panel colour. There SHALL be no cream/near-white body ground and no dark shell wall.

#### Scenario: Sidebar shares the ground's hue

- **WHEN** the app shell renders
- **THEN** the sidebar background is a tonal step of `--ground` (the same hue), and the
  content area sits directly on `--ground` with no floating sheet between them

#### Scenario: Tonal steps are one documented ramp

- **WHEN** DESIGN.md's Colors section is read
- **THEN** `--ground`, `--board`, and `--surface` appear as one hue at three values with a
  stated role each (base / panel / inset), and there is no cream or dark-wall token

### Requirement: Sidebar and shell chrome meet WCAG AA

Every persistent text element in the app shell — the sidebar wordmark, navigation links
(inactive, hover, active), and the application footer including the GNU AGPL §13 source
link — SHALL meet WCAG 2.1 AA contrast against the sidebar surface: at least **4.5:1** for
text below 18px or non-bold, and at least **3:1** for large text and for non-text UI
components that carry state. The footer source link is load-bearing for licence
compliance; an offer of source that cannot be read does not discharge the obligation.

The active navigation route SHALL be marked by a `--board` fill pill with `--heading`
text, and its distinction from inactive links SHALL NOT depend solely on a colour
difference that falls below 3:1, and SHALL NOT spend the primary accent.

#### Scenario: Inactive navigation link is legible on the sidebar

- **WHEN** the sidebar renders a navigation link that is not the current route
- **THEN** its computed text colour contrasts at ≥4.5:1 against the sidebar surface

#### Scenario: Footer and AGPL link are legible

- **WHEN** the app footer renders its attribution text and the GNU AGPL v3 link
- **THEN** both contrast at ≥4.5:1 against their ground

#### Scenario: Active route is distinguishable without the accent or a side-stripe

- **WHEN** a navigation link is the current route
- **THEN** it is marked by a `--board` fill pill with `--heading` text at ≥4.5:1, its
  distinction from inactive links does not depend on an element below 3:1, and it uses
  neither the terracotta accent nor a coloured left/right border

### Requirement: Depth is tonal, not shadow

In-content surfaces (panels, list rows, callouts, cards) SHALL be separated by tonal step
and low-contrast hairline (`--line`), never by a drop-shadow and never by a side-stripe
border (a coloured left/right border > 1px). Only overlays that float above arbitrary
content — modals, dropdown/add-section menus, and toasts — MAY cast a shadow, and it SHALL
be a single soft float value shared by all of them.

#### Scenario: A resting panel carries no shadow

- **WHEN** a listings board, callout, or content panel renders
- **THEN** it is distinguished by its surface tone and a hairline, and it casts no
  drop-shadow

#### Scenario: Overlays use the one soft float shadow

- **WHEN** a modal, dropdown, add-section menu, or toast renders
- **THEN** it uses the single soft float shadow value, and no resting in-content surface
  reuses it

### Requirement: Corner radius follows a rounded scale

The design system SHALL define corner radius as a small, documented scale mapped to
element roles through named tokens — never a single blanket value and never ad-hoc per
element. Interactive controls (buttons, inputs, navigation highlights) SHALL be
pill-shaped (`--r-btn`/`--r-field`/`--r-nav`); panels and boards SHALL use a medium radius
(`--r-panel`); the app frame SHALL use a larger radius (`--r-frame`). Zero radius is no
longer the system default.

#### Scenario: Radius scale is tokenised and documented

- **WHEN** DESIGN.md's corner/component section is read
- **THEN** the radius scale appears as named tokens with a role assigned to each (pill
  control / panel / frame), and the "don't round any corner" rule is absent

#### Scenario: Controls, panels, and frame use their assigned radius

- **WHEN** a button, a listings board, and the app frame render
- **THEN** the control is a pill, the board uses `--r-panel`, and the frame uses
  `--r-frame`, each applied via the token and not a hard-coded per-element value

### Requirement: Listings render as one tonal board split by hairlines

A list of items (job suggestions, filtered rows, history) SHALL render as a single tonal
panel (`--board`, `--r-panel`) whose items are divided by a bottom hairline (`--line`),
with no divider after the last item. Items SHALL NOT be individually bordered cards, SHALL
NOT each carry their own shadow, and SHALL NOT use a side-stripe accent.

#### Scenario: Suggestions are rows on one board, not a card grid

- **WHEN** the Job Suggestions page renders two or more suggestions
- **THEN** they appear as rows inside one `--board` panel separated by hairlines, the last
  row has no bottom hairline, and no row is a separately bordered or shadowed card

### Requirement: A listing's meta and status are text, not badges

A listing's own fields SHALL be rendered as text, not as pill badges. Meta (work style,
contract, location, languages) SHALL be a single inline monospace line with fields joined
by a separator; a positive match SHALL be a small square marker plus a plain word in the
marker colour (`--mark`); a deadline SHALL be coloured monospace text (`--deadline`), not a
chip. The Badge primitive SHALL be reserved for genuine categorical labels (a section's
destination, a language level) and SHALL NOT restate a row's own fields.

#### Scenario: Meta is an inline mono line

- **WHEN** a suggestion renders its work-style, contract, location, and language fields
- **THEN** they appear as one inline monospace line joined by a separator, with no field
  drawn as a bordered or filled pill

#### Scenario: Match and deadline are marker/text, not chips

- **WHEN** a suggestion is a positive match with a deadline
- **THEN** "match" renders as a square marker + word in `--mark`, the deadline renders as
  `--deadline` monospace text, and neither is a pill badge

## MODIFIED Requirements

### Requirement: The accent is spent only on the primary signal

Terracotta (`--accent` / `--accent-hover`) SHALL mark at most the primary action, the
current selection, and the deadline signal within a given view. It SHALL NOT be applied
wholesale by element type, and it SHALL NOT be used as a side-stripe.

Terracotta as a **fill** (`--accent`) and terracotta as **text** (`--accent-text`) are
distinct tokens and SHALL NOT be collapsed: `--accent` is tuned so white text on it meets
AA, but `--accent` as text on the sage grounds is below 4.5:1. Any terracotta rendered as
text — a call-to-action link, the deadline signal — SHALL use `--accent-text`, which meets
WCAG AA against `--ground`, `--board`, and `--surface` at normal text size.

In-content hyperlinks are styled with `--ink` plus an underline, not the accent. The
accent remains available to a link that *is* the view's next action.

#### Scenario: Ordinary content links are not accent-coloured

- **WHEN** a link renders inside page content — a job title, a source name, a posting link
- **THEN** it renders in `--ink` with a visible underline, and its accessible affordance
  does not depend on colour alone

#### Scenario: Accent count stays within the rule on a dense page

- **WHEN** the Job Suggestions page renders with sources, suggestions, filtered rows and
  history all populated
- **THEN** the elements drawn in terracotta are limited to the primary action button and
  the deadline text; the active navigation route is a tonal `--board` pill, not accent

#### Scenario: A call-to-action link may keep the accent

- **WHEN** a link is the single primary next action of its view, such as the Preferences
  end-card link
- **THEN** it may use the accent, subject to the one-primary-signal rule, rendered in
  `--accent-text` (not the fill value) so it meets AA against its ground

#### Scenario: Terracotta text meets AA on the sage grounds

- **WHEN** terracotta is rendered as text — a CTA link or the deadline signal — on
  `--ground` or `--board`
- **THEN** it uses `--accent-text`, which contrasts at ≥4.5:1, and never the fill value
  `--accent` (below 4.5:1 as text)
