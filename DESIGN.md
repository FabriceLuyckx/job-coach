---
name: Job Coach
description: The Atelier / Stone system — one drenched sage colour world, a purposeful (not decorative) terracotta accent, calm register, for a local-first career-application tool.
colors:
  ground: "#CCD4CD"
  board: "#D9E0DA"
  surface: "#E3E8E4"
  ink: "#1E332D"
  heading: "#14261F"
  muted: "#3A4B43"
  accent: "#BC4A26"
  accent-hover: "#A53E1E"
  accent-ink: "#FFFFFF"
  accent-soft: "#E7CFC4"
  accent-text: "#8D3317"
  mark: "#1F5A44"
  deadline: "#8D3317"
  line: "rgba(30, 51, 45, 0.16)"
  deep-red: "#8F2410"
  deep-red-soft: "#EAD9CF"
  mustard: "#6E5406"
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "{fs-2xl}"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  data:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    letterSpacing: "0"
rounded:
  btn: "999px"
  field: "999px"
  nav: "999px"
  panel: "22px"
  frame: "30px"
  sm: "12px"
  xs: "4px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  7: "32px"
  8: "40px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.btn}"
    padding: "9px 18px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.btn}"
    padding: "8px 17px"
  button-danger:
    backgroundColor: "{colors.deep-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.btn}"
    padding: "9px 18px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.btn}"
    padding: "9px 18px"
  board:
    backgroundColor: "{colors.board}"
    rounded: "{rounded.panel}"
    border: "1px solid {colors.line}"
  badge-lang:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    border: "1px solid {colors.line}"
    rounded: "{rounded.btn}"
---

# Design System: Job Coach

## 1. Overview

**Creative North Star: "Atelier / Stone"**

Job Coach owns a colour instead of hiding in neutral. The whole app lives in one
drenched, *lighter* colour world — a de-yellowed sage — rather than a light sheet
floating on a contrasting wall. There is no cream and no dark wall: the ground is sage
(`--ground`), the sidebar is a tonal *step* of that same ground, and content sits
directly on it. Depth comes from tone, not shadow; a list is one tonal board split by
hairlines, not a grid of bordered cards; meta and status are read as text, not stamped
into pill badges. One warm terracotta accent carries every real signal moment.

That calm is structural. Job Coach's brand personality is calm, trustworthy,
reassuring — job hunting is stressful enough — so the confidence lives in the drenched
ground and the rounded, roomy form, while colour, motion, and copy stay purposeful rather
than loud. Terracotta is warm by hue and, since 2026-07-22, spent generously wherever it
means something: the primary/submit action (every occurrence, not just one per screen),
the current selection, the deadline signal, and a small wayfinding touch (the active nav
item — its label and icon — and the wordmark). It still never marks decoration or a
merely-repeated element with no state behind it. This explicitly rejects the
**generic SaaS dashboard** (soft-shadowed cards, blue-gradient chrome, pastel status
pills), **corporate job-board chrome** (LinkedIn/Indeed dense blue, stock-photo
emptiness), and the **AI-assistant chat-bot look** (bubbles, glowing orbs, sparkle
iconography) — the AI in this app does quiet background work, it never performs as a
character. "Not generic" is earned by *execution* — the mono data voice on every field,
tonal-only depth, and a purposeful (not decorative) accent — not by asserting it, and not
by the absence of radius or depth.

**Key Characteristics:**
- One drenched sage ground at three tonal values (`ground`/`board`/`surface`); no cream,
  no dark shell wall
- Depth is tonal + hairline; no resting drop-shadow, no side-stripe accent, no cards
- Listings are one tonal board split by hairlines
- Meta/status are text (mono line, coloured marker/deadline), not pill badges
- Rounded, roomy: pill controls, round panels/frame, generous spacing
- System-sans body paired with a mono data voice for every data line; mixed-case,
  weight-based headings — no blanket uppercase
- One terracotta accent, spent on every real action/selection/deadline signal — not on
  decoration, and not capped at one occurrence per screen

## 2. Colors

One sage ground at three values, deep-pine ink, one warm terracotta accent, one pine
marker for match/success, and two narrow semantics (deep red, mustard) that never get
confused with the accent.

### Ground — one sage hue at three values
The interface is one drenched ground, not a sheet on a wall. The three values are a
ramp (one hue), so any of them can meet on screen without clashing:

| Value | Token | Role |
|---|---|---|
| `#CCD4CD` | `--ground` | Base — the app ground, what content sits directly on |
| `#D9E0DA` | `--board` | Raised panel — the listings board, callouts, menus |
| `#E3E8E4` | `--surface` | Inset — input/field fills, the lightest step |

The sidebar is `color-mix(--ink 8%, --ground)` — a tonal *step* of the ground, one hue
down from the base, never a separate panel colour. There is no cream (`--paper` as a
floating sheet) and no dark wall (`--frame`).

### Ink — deep pine
- **Ink** (`--ink` `#1E332D`): body text.
- **Heading** (`--heading` `#14261F`): headings — a touch deeper than ink.
- **Muted** (`--muted` `#3A4B43`): secondary text, labels, help, meta. Clears WCAG AA on
  every ground it sits on (6.12:1 on `--ground`, with headroom on `--board`/`--surface`).

### Accent — terracotta (fill vs. text are two tokens, do not collapse them)
- **Terracotta fill** (`--accent` `#BC4A26`, hover `--accent-hover` `#A53E1E`, on-accent
  text `--accent-ink` `#FFFFFF`, tint `--accent-soft` `#E7CFC4`): the primary action, the
  current selection. Tuned as a **fill** — white on it is 5.07:1.
- **Terracotta text** (`--accent-text` `#8D3317`): any terracotta *rendered as text* — a
  call-to-action link, the deadline signal, the "Coach" half of the sidebar wordmark.
  `--accent` as small text on the sage grounds is only 3.34:1 (ground) / 3.77:1 (board) and
  **fails AA**; `--accent-text` clears it everywhere it's used (5.30:1 on ground, 5.97:1 on
  board, 6.47:1 on surface). Darkened again 2026-07-22 (from `#963618`) once the wordmark
  put it on the sidebar's tonal step (`color-mix(ink 8%, ground)`) — the darkest surface in
  the system — where the older value only cleared 4.28:1.
- **Deadline** (`--deadline` = `--accent-text`): a deadline is always coloured text,
  never a fill, so it *is* the text token.

### Marker — pine green
- **Mark** (`--mark` `#1F5A44`): the match/success signal — a small square marker + a
  plain word, and success states. This replaces the old teal ramp entirely; there is no
  teal wall, teal signal, or teal tint.

### Semantic (narrow use)
- **Mustard** (`--highlight` `#6E5406`): unsaved-change markers, low-credit warnings,
  "needs an answer" nudges, info toasts. Never used for errors; darkened to clear AA on
  the sage grounds.
- **Deep Red** (`--danger` `#8F2410`, tint `--danger-soft`): errors and destructive
  actions — deeper than terracotta so a danger button is never misread as a primary one.

### Palette nudges
**Stone** is the shipped default. **Fern** and **Meadow** (deeper-sage variants of the
same ground ramp, same terracotta accent) are sanctioned nudges for a future themed
build; they change only the ground values, never the accent or the structure.

### Named Rules
**The One Line Rule.** Every hairline in the system is `--line`
(`color-mix(--ink 16%, transparent)`) — a low-contrast ink line, never a separate gray
token and never a coloured side-stripe.

**The Rationed Accent Rule.** Terracotta is not decoration and never marks two competing
things in the same spot — but it is not capped at one occurrence per screen either
(2026-07-22 loosened this: the first cut of the rule read as monotonous rather than
restrained, because genuine state — a chosen option, a submit action repeated once per
row — was being pushed to ink instead of spending the accent it was named for). It marks:
the default/submit action (every instance of it, including once per row in a list of
identical actions — e.g. Accept on every job suggestion), the current selection (segmented
controls, the engine/model pickers — accent fill, not ink), and the deadline signal. It
does **not** mark decoration, categorical badges, or a *repeated but non-actionable*
element (a numbered step badge, a colour-picker's own selection ring, which stays neutral
so it doesn't fight the swatch colour it's ringing). Fills use `--accent`; terracotta
*text* (and any accent icon sitting beside it, e.g. the active nav item) uses
`--accent-text`, which clears AA on every ground including the sidebar's tonal step — an
icon on its own may use the brighter `--accent` where nothing else constrains it, since
icons only need 3:1, not 4.5:1.

## 3. Typography

**Body / Display Font:** the system-sans stack (`system-ui, -apple-system,
BlinkMacSystemFont, Segoe UI, Roboto, sans-serif`). One family carries the whole
hierarchy through weight and size. (The packaged build keeps a self-hosted Inter as a
neutral fallback; it renders as a plain sans, not a display face.)

**Data Font:** a mono stack (`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`,
`--data-font`) — the data voice. Every data line uses it: dates, meta, counts, the
page sub-line, the match marker word.

**Character:** calm and plain. Headings are heavier and mixed-case — never blanket
uppercase. Body copy at 14px/1.55 reads unhurried. The one thing that *is* uppercase is
the mono match-marker word and small utility labels; a serif or quirky-grotesque display
face was trialled and rejected as cliché.

### Hierarchy
- **Page title** (700, 26px `--fs-2xl`, mixed case): page titles.
- **Section title** (700, 17–20px, mixed case): section headers, modal titles,
  collapsible titles.
- **Emphasized body** (600, 15px): question titles, card sub-headings.
- **Body** (400, 14px `--fs-base`, 1.55): all prose and form values. Cap long-form prose
  at 65–75ch.
- **Data line** (`--data-font`, 13px): dates, counts, a listing's meta line, the match
  word. Monospace + a middot separator reads as a discrete field list.

### Named Rules
**The Case Signal Rule.** Mixed case is the default — headings included. Uppercase is
reserved for the mono match-marker word and small utility/category labels. Never
uppercase a sentence the user reads as prose, and never blanket-uppercase headings.

**The Data Voice Rule.** Anything that is data — a date, a count, a listing's fields, a
match verdict — is set in `--data-font`. This is what carries at-a-glance scannability
now that meta is text, not badges.

## 4. Elevation: Depth is Tonal

Depth is tonal, not shadow. In-content surfaces separate by the
`ground`/`board`/`surface` tonal steps plus low-contrast hairlines (`--line`). Nothing in
normal document flow casts a drop-shadow, and nothing uses a coloured side-stripe.

**The one exception:** overlays that float above arbitrary content — modals,
dropdown/add-section menus, and toasts — sit where tone cannot separate them, so they MAY
cast a single soft float shadow (`--shadow-float`), shared by all of them. No resting
in-content surface reuses it.

### Named Rules
**The Tonal-Depth Rule.** A resting panel, board, row, or callout is distinguished by its
surface tone and a hairline — never a shadow, never a side-stripe (a coloured left/right
border). If an element needs to feel raised, step its tone up (`--board`/`--surface`), not
add a shadow.

**The Float Rule.** Only overlays get `--shadow-float`, and it is one soft value for all
of them. A hard offset shadow on a resting card is the banned pattern.

## 5. Components

### Buttons
- **Shape:** pill (`--r-btn`, `999px`) on every variant; no button shadow.
- **Primary:** terracotta fill (`--accent`), white text, hover darkens to
  `--accent-hover`. Full state set: default / hover / active / `:focus-visible` ring /
  disabled (disabled keeps white text on a desaturated fill, never gray-on-gray).
- **Secondary:** transparent fill, `--line` hairline border, ink text; hover fills to a
  tonal step.
- **Danger:** deep-red fill, white text — distinct hue so it's never read as primary.
- **Ghost:** transparent, muted text; hover fills to `--accent-soft` with ink text.
- **Icon:** small square-ish pill, no label; destructive intent is ink by default and only
  turns red on hover, so lists never show permanent red controls.

### Listings — one tonal board
- A list (job suggestions, filtered rows, history) is a single `--board` panel
  (`--r-panel`, a `--line` hairline, no shadow). Its rows are divided by a bottom hairline
  (`--line`); the last row has none. **No** per-item border, per-item shadow, or
  side-stripe. Separation is tonal + hairline.
- A de-emphasised row (filtered/rejected) steps its tone, never fades opacity — fading a
  row also fades the AI's stated reason, the one thing that must stay readable.

### Meta & status — text, not badges
- **Meta** (work style, contract, location, languages): one inline `--data-font` line,
  fields joined by a middot (` · `). No field is a pill.
- **Match:** a 7px square marker + the plain word in `--mark`.
- **Deadline:** `--deadline` mono text — never a chip.
- **Badge** primitive: reserved for genuine *categorical* labels (a section's destination,
  a language level). It is a pill (`--r-btn`) hairline-outlined tag, and it SHALL NOT
  restate a row's own fields.

### Inputs / Fields
- Pill (`--r-field`) single-line, `--r-panel` for `textarea`; `--surface` fill, `--line`
  border. Focus keeps a `:focus-visible` accent ring for a11y (never a colour-only border
  change).

### Callout / Empty state
- `--r-panel`, a tonal accent tint (`color-mix(--accent 10%, --board)`) or a plain tonal
  step; a hairline; no shadow.

### Navigation
- A fixed sidebar filled with the sage tonal step (`color-mix(--ink 8%, --ground)`),
  holding the wordmark and icon+label links (Lucide icons). Inactive links are `--muted`
  ink; hover brightens to `--ink` over a faint tonal wash. The **active** route is a
  `--board` fill **pill** (`--r-nav`) whose **label and icon** are both `--accent-text`
  (the icon inherits `currentColor`) — the pill itself stays tonal (no side-stripe, no
  accent fill on the pill), so "you are here" is carried by tone *and* named in terracotta,
  one small permanent wayfinding pop rather than a second competing fill. `--accent-text`,
  not the fill `--accent`, so the label clears AA on the board pill (5.97:1).
- **Wordmark:** "Job **Coach**" separates its words by weight *and* hue — `--muted` then
  `--accent-text` on "Coach". It never changes state, so it reads as identity rather than
  spending the accent's "current signal" meaning.

### Segmented control (`.seg`)
- A pill-outlined button row (`--r-btn`, `--line` border) with hairline dividers — no gaps,
  no individual pills. The selected option fills to `--accent` with `--accent-ink` text —
  the same accent-fill selection signal the engine/model pickers use (2026-07-22: this was
  ink-fill; the Rationed Accent Rule names "the current selection" as an accent role, so a
  chosen option now spends it).

### Overlays
- Modal/menu/toast use `--r-panel` (or `--r-btn` for small controls within them) and the
  single `--shadow-float`.

## 6. Do's and Don'ts

### Do:
- **Do** keep the app one drenched sage ground; the sidebar is a tonal step of it, content
  sits directly on `--ground`, no floating sheet.
- **Do** keep every hairline at `--line`; separate depth by tone, never by a shadow or a
  side-stripe.
- **Do** render a listing as one `--board` panel with hairline-divided rows — not a grid
  of bordered cards.
- **Do** set every data line in `--data-font`; meta is a mono middot line, match is a
  marker + `--mark` word, deadline is `--deadline` mono text.
- **Do** spend terracotta on every real action/selection/deadline signal — including once
  per row in a list of identical actions; use `--accent` for fills and `--accent-text` for
  any terracotta text.
- **Do** style in-content links as `--ink` with an underline; the underline is the
  affordance, not the colour. `--accent-text` is reserved for a link that *is* the view's
  next action.
- **Do** keep controls pill-shaped and spacing roomy; copy and motion calm.

### Don't:
- **Don't** reintroduce cream, a dark wall, or a floating page sheet — the world is one
  sage ground.
- **Don't** build cards: no per-item border + shadow, no soft card shadow on resting UI,
  no coloured side-stripe.
- **Don't** stamp a row's own fields into pill badges; meta/status are text. Badge is only
  for categorical labels.
- **Don't** paint an element terracotta by *type* (a rule like `a { color: accent }`) —
  every terracotta use still has to be a real action, selection, or deadline, not a
  blanket style; decorative or merely-repeated elements (step badges, a colour-picker's
  own selection ring) stay neutral.
- **Don't** blanket-uppercase headings, or set a data line in the body sans.
- **Don't** read as a **generic SaaS dashboard**, **corporate job-board chrome**, or an
  **AI chat-bot persona**.
- **Don't** soften terracotta into a friendlier tint for primary actions — use the full
  value; softness lives in copy, motion, and the roomy form, not in desaturating the
  accent.
