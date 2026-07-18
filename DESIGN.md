---
name: Job Coach
description: A mid-century print-shop poster system for a calm, local-first career-application tool.
colors:
  paper: "#F2EFE4"
  surface: "#FBFAF3"
  surface-dim: "#ECE8D9"
  ink: "#1C1A16"
  muted: "#6E6A5E"
  accent: "#C8401F"
  accent-hover: "#A83415"
  accent-soft: "#F5DFD5"
  teal: "#2F6B66"
  teal-soft: "#DDEAE7"
  wall-teal: "#6B8F91"
  deep-red: "#8F2410"
  deep-red-soft: "#F3DCD4"
  mustard: "#8F6B0C"
  info-soft: "#ECE8D9"
typography:
  display:
    fontFamily: "Inter Variable, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "{fs-2xl}"
    fontWeight: 800
    lineHeight: 1.2
    letterSpacing: "0.02em"
  body:
    fontFamily: "Inter Variable, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter Variable, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.04em"
rounded:
  none: "0px"
  chip: "2px"
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
    textColor: "#FFFFFF"
    rounded: "{rounded.none}"
    padding: "8px 15px"
  button-primary-hover:
    backgroundColor: "{colors.accent-hover}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "7px 14px"
  button-danger:
    backgroundColor: "{colors.deep-red}"
    textColor: "#FFFFFF"
    rounded: "{rounded.none}"
    padding: "8px 15px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.none}"
    padding: "8px 15px"
  badge-cv:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.paper}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
  badge-ai:
    backgroundColor: "{colors.teal}"
    textColor: "{colors.paper}"
    rounded: "{rounded.chip}"
    padding: "2px 8px"
---

# Design System: Job Coach

## 1. Overview

**Creative North Star: "The Print Shop"**

Job Coach reads as something printed, not something rendered: ink-black hairline
rules, flat color blocks instead of gradients, hard offset shadows instead of soft
blurs, and squared corners everywhere (`--radius: 0px`). Each page is a cream poster
sheet (`--paper`) laid on a muted teal gallery wall (`--frame`, the app shell behind
the fixed sidebar) — the sheet gets a hard drop shadow, the wall doesn't. Headings are
one grotesque family (Inter), always bold and uppercase; there is no second display
font pretending to be more decorative than the first.

That printed confidence is structural, not emotional. Job Coach's brand personality is
calm, trustworthy, reassuring — job hunting is stressful enough — so the boldness
lives in geometry and typography (hard edges, heavy uppercase headings, flat ink
rules), while color usage, motion, and copy stay restrained. Vermilion is loud by hue,
but it is rationed to one thing at a time: the active nav tab, a primary action, a
deadline chip. This explicitly rejects the **generic SaaS dashboard** (rounded cards,
soft shadows, blue-gradient chrome), **corporate job-board chrome** (LinkedIn/Indeed
dense blue, stock-photo emptiness), and the **AI-assistant chat-bot look** (bubbles,
glowing orbs, sparkle iconography) — the AI in this app does quiet background work, it
never performs as a character.

**Key Characteristics:**
- Flat ink-on-cream print system: zero border-radius, hairline borders, no gradients
- One grotesque type family; hierarchy is weight/case/size, not font-switching
- A single accent (vermilion) used sparingly, rationed to primary actions and state
- A teal counterpoint used specifically for AI/"good" signals (success, AI badges)
- Hard offset shadows (`6px 6px 0`) reserved for things that float: modals, menus,
  toasts, the page sheet itself — never resting UI

## 2. Colors

A cream-and-ink print base, one warm accent, one cool counterpoint, and two narrow
semantic colors (mustard, deep red) that never get confused with the accent.

### Primary
- **Vermilion** (`#C8401F`, hover `#A83415`, tint `#F5DFD5`): primary actions,
  the active nav tab's underline, star-rating fill, deadline chips, the numbered
  question blocks on Preferences. The one color allowed to feel urgent — used at low
  frequency on purpose.

### Secondary
- **Teal** (`#2F6B66`, tint `#DDEAE7`): the AI/success counterpoint — "AI" badges,
  success states, the `--success` alias. Reads as considered and cool against
  vermilion's warmth, never competing for the same job.
- **Wall Teal** (`#6B8F91`): a separate, more muted teal that is *not* used for
  content — it's the app-shell background (`--frame`), the "wall" the cream page
  hangs on, and the sidebar fill. Keep it out of in-page UI; its only job is the
  shell.

### Neutral
- **Cream** (`--paper` `#F2EFE4`): page background, the poster sheet itself.
- **Card White** (`--surface` `#FBFAF3`): cards, inputs — barely lighter than cream,
  never a hard white.
- **Panel Cream** (`--surface-dim` `#ECE8D9`): nested panels, collapsible headers,
  empty states — one step down from card white.
- **Ink** (`--ink` / `--border` / `--heading` `#1C1A16`–`#141311`): body text,
  headings, and *every* hairline border in the system. Borders and text share the
  same ink value on purpose — there is no separate lighter "border gray".
- **Muted** (`#6E6A5E`): secondary text, labels, help copy, disabled affordances.

### Semantic (narrow use)
- **Mustard** (`#8F6B0C`): unsaved-change markers, low-credit warnings, info toasts.
  Never used for errors.
- **Deep Red** (`#8F2410`, tint `#F3DCD4`): errors and destructive actions.
  Deliberately deeper/darker than vermilion so a danger button never gets misread as
  a primary one at a glance.

### Named Rules
**The One Ink Rule.** Every border, hairline, and rule in the system is `--ink`
(`#1C1A16`) at full or mixed opacity — never a separate mid-gray border color. If a
border needs to look lighter, mix ink with the background (`color-mix(in srgb, var(--ink) 45%, transparent)`), don't invent a new gray token.

**The Rationed Accent Rule.** Vermilion marks *one* primary thing per view: the
default action, the active tab, the thing you're most likely to click next. If two
elements on a screen both want vermilion, one of them is wrong.

## 3. Typography

**Display Font:** Inter Variable (with `-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif`)
**Body Font:** Inter Variable (same family, same stack — one typeface for the whole app)

**Character:** Confident and squared, calm underneath — headings are heavy,
uppercase, and tightly tracked (a poster masthead), but body copy at 14px/1.55 stays
plain, lowercase, and unhurried. The boldness is in the headings and structure, not
the sentence you're reading.

### Hierarchy
- **Display / Page title** (800, 26px `--fs-2xl`, 1.2): page titles, always paired
  with a 4px ink rule underneath (`.page-title`) — the poster masthead.
- **Headline / Section title** (800, 20px `--fs-xl` down to 17px `--fs-lg`, uppercase):
  section headers, modal titles, collapsible titles, card headings.
- **Title / Emphasized body** (600–700, 15px `--fs-md`): question titles, card
  sub-headings, collapsible-title-sm rows — not uppercase, just heavier.
- **Body** (400, 14px `--fs-base`, 1.55): all prose and form values. Cap prose at
  65–75ch where it runs long-form (letter guides, tailoring notes).
- **Label** (700, 13px `--fs-sm`, uppercase, 0.04em tracking): button labels, badges
  at 11px `--fs-xs`. Anything that names an action or a category is uppercase and
  tracked; anything the user is reading is not.

### Named Rules
**The Case Signal Rule.** Uppercase means "this labels an action or category"
(buttons, badges, headings). Sentence case means "this is content" (body text,
collapsible-toggle labels that wrap real content, menu options). Never uppercase a
sentence the user is meant to read as prose.

## 4. Elevation

Flat by default — cards, inputs, and panels sit at zero elevation with only a 1px ink
border to separate them from the cream ground. The single hard shadow
(`6px 6px 0 rgba(20, 19, 17, 0.18)`, `--shadow-pop`) is reserved for things that
genuinely float above the page: the page sheet itself against the teal wall, modals,
dropdown/add-section menus, and toasts. Nothing else gets a shadow — depth is
otherwise conveyed by the ink border and by nested-panel tone (`--surface` →
`--surface-dim`), not by blur.

### Shadow Vocabulary
- **Poster-pop** (`box-shadow: 6px 6px 0 rgba(20, 19, 17, 0.18)`): the one shadow in
  the system. Hard-edged, offset, no blur — reads as a printed sheet with a cast
  shadow, not a soft UI lift. Used on `.page-container`, `.modal-box`, `.toast`,
  `.add-section-menu`.

### Named Rules
**The Flat-At-Rest Rule.** Nothing in normal document flow gets a shadow. If an
element needs to feel important, use the ink border, a filled background, or spacing
— never a shadow. Shadows are reserved for elements that visually detach from the
page (overlays, floating menus, the page sheet against the wall).

## 5. Components

### Buttons
- **Shape:** zero radius (`0px`), sharp corners on every variant.
- **Primary:** vermilion fill, white text, `8px 15px` padding, uppercase 13px label,
  hover darkens to `#A83415`. Disabled keeps full white-text contrast on a
  desaturated fill (never washes out to gray-on-gray).
- **Secondary:** transparent fill, 1.5px ink outline, ink text — inverts to a solid
  ink fill with cream text on hover ("poster inversion"). Padding compensates the
  border (`7px 14px`) so it sits flush with primary buttons.
- **Danger:** deep-red fill, white text — same shape/padding as primary, distinct hue
  so it's never confused with the accent at a glance.
- **Ghost:** transparent, muted text, hover fills to accent-soft with ink text. Used
  for lower-emphasis actions in dense rows.
- **Icon:** 28×28px square, no label, no border — destructive intent (e.g. remove) is
  ink by default and only turns red on hover, so lists never show permanent red
  squares.

### Chips / Badges
- **Style:** small, squared (2px radius, not pill-shaped), uppercase, 11px, bold,
  tightly tracked. Filled variants (`badge-cv` accent, `badge-ai` teal, `badge-jobs`
  ink) carry a solid background + cream text; outline variants (`badge-lang`,
  `badge-neutral`, `badge-deadline`) are transparent with an ink or accent border.
- **State:** tags (skills, keywords) are solid ink chips with an inline remove ×;
  read-only AI-decision chips use a thin ink border instead of a fill, to visually
  separate "the AI decided this" from "you typed this."

### Cards / Containers
- **Corner Style:** zero radius, matching buttons and inputs — nothing in the system
  is rounded.
- **Background:** `--surface` (card white) on the cream page; nested panels step down
  to `--surface-dim`.
- **Shadow Strategy:** none — see Elevation. Separation comes entirely from the 1px
  ink border.
- **Border:** 1px solid ink on every card.
- **Internal Padding:** `--space-5` (20px) standard card padding.

### Inputs / Fields
- **Style:** 1px ink border, zero radius, `--surface` background, 7px/10px padding.
- **Focus:** border color shifts to vermilion — no glow, no outline ring, just the
  color change.
- **Error / Disabled:** error text below the field in deep-red (`.error-msg`);
  disabled states desaturate rather than gray out completely.

### Navigation
- **Style:** a fixed 208px sidebar filled with Wall Teal, holding the wordmark and
  icon+label links (Lucide icons, 17px). Inactive links sit at ~82% white opacity on
  teal; hover brightens to full white with a faint ink wash. The **active** item
  reads as a cream tab cut from the poster sheet — full `--paper` background, ink
  text, a 3px vermilion left border — rather than a colored pill or underline.
- **Mobile:** not yet adapted for narrow viewports (desktop-first; app is currently
  used as a local/desktop tool).

### Segmented Control (signature component)
The `.seg` control (used for the working-style choice on Preferences) is a squared
button row with a single 1px ink outer border and 1px ink dividers between options —
no gaps, no individual pills. The selected option inverts to a solid ink fill with
cream text, exactly mirroring the secondary-button hover treatment, so the "selected"
state visually says the same thing everywhere in the app: ink fill = chosen/active.

## 6. Do's and Don'ts

### Do:
- **Do** keep every border and rule at `--ink` (`#1C1A16`); never introduce a
  separate gray border token.
- **Do** ration vermilion to one primary signal per screen — the default action, the
  active tab, or the single most important chip (deadline).
- **Do** keep hard, offset, blur-free shadows (`6px 6px 0`) exclusive to floating
  elements (modals, menus, toasts, the page sheet) — never on resting cards or
  buttons.
- **Do** keep uppercase reserved for actions/labels/headings and sentence case for
  anything the user reads as content.
- **Do** keep copy and motion calm even where the geometry is bold — this is a tool
  for a stressful process, not a loud dashboard.

### Don't:
- **Don't** round any corner. `border-radius` is `0px` everywhere except the 2px chip
  radius on badges/tags — never introduce `8px`/`12px` "friendly" rounding.
- **Don't** build a **generic SaaS dashboard**: no soft card shadows, no
  blue-and-white gradients, no pastel status pills.
- **Don't** read as **corporate job-board chrome**: avoid dense blue UI chrome or
  stock-photo emptiness that makes this feel like "another job board."
- **Don't** give the AI a **chat-bot persona**: no chat bubbles, no glowing gradient
  orbs, no sparkle/magic-wand iconography. The AI works quietly in the background.
- **Don't** use a second display typeface for "decorative" contrast — Inter carries
  the whole hierarchy through weight, case, and size alone.
- **Don't** soften the vermilion into a lighter "friendlier" tint for primary
  actions — use the full-saturation value; softness lives in copy and motion, not in
  desaturating the accent.
