## Context

Job Coach's frontend runs on the "Print Shop" system: a warm cream sheet floating on a
dark teal wall (`--frame` `#1E3A38`), full-strength 1px ink hairlines round bordered
cards, hard blur-free offset shadows, blanket-uppercase Inter headings, vermilion accent,
a three-value teal ramp. The owner reads this as generic AI design and named the specific
tells to escape: overuse of cards, cream grounds, soft drop-shadows, side-stripe accents,
glassmorphism, and pill badges.

A design study (impeccable) explored form languages on the real Job Suggestions screen and
resolved **Atelier / Stone** into a published reference (the whole screen reskinned by a
token layer: palette, radius scale, de-badged meta, one tonal board). The user locked:
Stone·terracotta palette, pill controls + round/roomy frame, system-sans × mono type, no
badges.

The visual system is governed by DESIGN.md + PRODUCT.md (impeccable) and specced in
`app-shell-visual-system`. Both currently *structurally* encode the old identity (zero
radius, dark wall, teal ramp, cream) as the defence against "generic SaaS". This change
replaces that identity, not just its corners.

Constraints: single system-sans family + one mono; WCAG AA is enforced by
`scripts/check_contrast.mjs` (shell-token parser); shared primitives
(Button/Toast/Modal/Collapsible/EmptyState/Badge) are the only place these styles live;
no backend/API/i18n changes; CV templates untouched.

## Goals / Non-Goals

**Goals:**
- Replace the palette *and* the form tokens (radius, elevation, border weight, heading
  case, badge usage) with the Atelier / Stone system, keeping accent rationing,
  ink-underline links, calm register, and every WCAG AA threshold intact.
- Keep the change a **token + shared-primitive layer** so pages inherit it with minimal
  per-file edits (the reference is one screen reskinned by swapping tokens).
- Rewrite DESIGN.md and reconcile PRODUCT.md so "not generic SaaS" is redefined as the
  drenched Stone world + rationed terracotta + calm register.

**Non-Goals:**
- No changes to the printed **CV templates** (`templates/cv/*`).
- No feature, layout-structure, copy, information-architecture, or i18n changes.
- No new fonts fetched from a CDN; system-sans + self-hostable mono only.
- Not a dark theme; Atelier is a *lighter*, drenched-daylight world.

## Decisions

**1. Migrate at the token layer, not per component.**
The CSS already reads most choices from custom properties. Redefine the *palette* tokens
(`--ground`/`--board`/`--surface`/`--ink`/`--heading`/`--muted`/`--accent`/`--accent-hover`/
`--accent-soft`/`--mark`/`--deadline`/`--line`), add a *radius scale*
(`--r-btn`/`--r-field`/`--r-nav`/`--r-panel`/`--r-frame`), and repoint component classes.
Retire the dead tokens (`--frame`, cream `--paper` as a floating sheet, the teal ramp,
`--shadow-pop`/`--shadow-pop-wall`). Smallest diff; the reference proves one token swap
reskins a whole screen.

**Locked Stone values** (DESIGN.md holds these; the spec stays structural):
```
--ground:#CCD4CD; --board:#D9E0DA; --surface:#E3E8E4;
--ink:#1E332D; --heading:#14261F; --muted:#3A4B43;
--accent:#BC4A26; --accent-hover:#A53E1E; --accent-ink:#FFFFFF; --accent-soft:#E7CFC4;
--accent-text:#963618; --mark:#1F5A44; --deadline:var(--accent-text);
--line:color-mix(in srgb, var(--ink) 16%, transparent);
--r-btn/--r-field/--r-nav:999px; --r-panel:22px; --r-frame:30px;
```
Fern and Meadow (deeper sage variants, same terracotta) are documented as sanctioned
palette nudges but Stone is the shipped default.

**Fill vs. text terracotta (do not collapse these).** `--accent` (`#BC4A26`) is tuned
as a **fill** — white on it is 5.07:1 — but as small text on the sage grounds it is only
3.34:1 (ground) / 3.77:1 (board), which **fails AA**. Any terracotta used as *text* (a
CTA link, the deadline signal) MUST use `--accent-text` (`#963618`: 4.89:1 on ground,
5.51:1 on board, 5.97:1 on surface). This mirrors the split the previous system already
learned (`--accent` fill vs. `--accent-text`); the sage ground is darker than the old
cream (L≈0.83), so the text value is darkened further than the cream-era `#AD3618` to
keep the same AA headroom. `--deadline` is always text, never a fill, so it *is*
`--accent-text`.

**2. One drenched ground; no cream, no white cards, no dark wall.**
`ground`/`board`/`surface` are three values of one sage hue. The sidebar is
`color-mix(--ink 8%, --ground)` — a tonal step of the same world, not a separate panel
colour. Content sits directly on `--ground`; the floating page sheet is dropped.

**3. Depth is tonal, not shadow.**
In-content separation comes from the ground/board/surface tonal steps + low-contrast
hairlines (`--line`, ink 16%). No drop-shadow on cards or rows. **Exception:** overlays
(modal/menu/toast) sit above arbitrary content where tone can't separate them, so they
MAY use a single soft float shadow. This preserves the "shadow means something"
perceivability idea while banning decorative card shadows.

**4. One tonal board split by hairlines — cards are removed.**
Listings render as a single `--board` panel (`--r-panel`) whose rows are divided by a
bottom hairline (last row none). No per-item border, no per-item shadow, no side-stripe.

**5. De-badge: meta/status are text.**
A listing's meta is one inline **mono** line, fields joined by a middot; "match" is a
7px square marker + the plain uppercase-mono word in `--mark`; the deadline is
`--deadline` mono text (= `--accent-text`, AA on ground/board at any size), not a chip. The Badge primitive is reserved for genuine
categorical labels (section destination, language level) — it is not used to restate a
row's own fields.

**6. Terracotta replaces vermilion as the one rationed accent.**
`--accent` (`#BC4A26`) marks at most the primary action, current selection, and the
deadline signal. As a **fill** it uses `--accent`; as **text** (a CTA link, the deadline)
it uses `--accent-text` for AA. Content links stay `--ink` + underline. The active nav
route is a `--board` fill pill (tonal, no accent, no side-stripe).

**7. Rounded, roomy form.**
Pill controls (buttons/inputs/nav highlight `999px`), round panels (`22px`) and frame
(`30px`), generous spacing (the "tighter" density was rejected as too dense). Squared
zero-radius is no longer the system default.

**8. Type: system-sans × mono; drop blanket uppercase.**
Body is the system-sans stack; every data line uses mono (`--data-font`). The global
`text-transform: uppercase` on headings is removed; headings are weight-based, mixed
case. Uppercase survives only on the mono match-marker word and small utility labels.
(Serif/quirky-grotesque display faces were trialled and rejected as cliché.)

**9. Re-verify contrast, don't assume it.**
`scripts/check_contrast.mjs` parses shell tokens — repoint it at the Stone tokens
(sidebar sage, terracotta on ground, `--mark` on `--board`, `--muted` on `--ground`,
`--deadline` on `--board`) and re-run. The AGPL §13 footer link's legibility is
preserved against the sage ground.

## Risks / Trade-offs

- **[Impeccable design-detector fights the change]** the hooks encode the old
  anti-references (rounded/soft = slop; cream = brand). → Rewrite DESIGN.md/PRODUCT.md
  first so the detector's source of truth moves with the change.
- **[A drenched coloured ground reduces text contrast headroom]** vs. white/cream. →
  Stone is light (L≈0.83); `--ink`/`--heading`/`--muted` all clear AA with headroom on
  `--ground` and `--board` (`--muted` is 6.12:1 on ground). The **actual** thin pair is
  terracotta *as text*: `--accent` is a fill (3.34:1 as small text — fails), so text uses
  the darkened `--accent-text` (4.89:1). The contrast checker gates every pair, and MUST
  include accent-as-text and deadline on `--ground`, not just white-on-accent-fill.
- **[De-badging loses at-a-glance scannability]** that pills gave. → Mitigated by the
  mono data voice (monospace + middot reads as a discrete field list) and the coloured
  marker/deadline; the reference confirms the row still parses at a glance.
- **[Overlays with a soft shadow look like the banned card shadow]** → the ban is
  scoped to resting in-content surfaces; overlays are the one sanctioned exception and
  use a single float value, not per-card decoration.
- **[Sage + terracotta is itself a saturated 2024–26 "earthy/artisan" aesthetic]** — the
  second-order reflex once cream-SaaS is rejected. → The palette direction is user-locked
  after a real design study, so this change does not reopen the hue; what keeps it clear
  of generic-earthy is *execution*, and the docs must say so: the mono data voice on every
  field, tonal-only depth (no soft cards), and one rationed accent — not a wellness-brand
  full-palette. DESIGN.md/PRODUCT.md argue "not generic" through those, not by asserting it.
- **[Hard-coded `0`/`2px` radii and cream/teal/vermilion hexes scattered in components]**
  bypass the tokens and leave old-identity islands. → Grep audit in tasks; route every
  corner/colour through a token.

## Migration Plan

1. DESIGN.md + PRODUCT.md + CLAUDE.md design-note rewrite (source of truth first).
2. Token layer: `index.css` (Stone palette, radius scale, retire dead tokens, mono data
   font, drop uppercase) and `App.css` (sidebar tonal step, content on ground, no sheet,
   nav pill).
3. Point primitives/components at the tokens (buttons/inputs pill, listings board with
   hairline rows, de-badged meta via Badge-usage change, callout tonal, overlays keep one
   soft float shadow).
4. Per-page visual audit (Profile, Preferences, Jobs, Applications, Settings, Onboarding)
   + grep for hard-coded radii/shadows/old hexes.
5. Re-run `scripts/check_contrast.mjs`; fix regressions. Screenshot pass vs. the reference;
   `/impeccable audit` on changed files.

Rollback: revert the token commit — since pages read tokens, the system reverts wholesale.

## Open Questions

- ~~Keep cream or move off it?~~ **Resolved:** drenched Stone sage ground; no cream.
- ~~Keep the dark teal wall?~~ **Resolved:** retired; sidebar is a tonal step of the ground.
- ~~Pair a display face?~~ **Resolved:** system-sans × mono; serif/grotesque displays
  rejected as cliché.
- Retire the bundled Inter entirely for system-only, or keep it as the packaged-build
  fallback body face? (Leaning: keep as fallback; it renders as a neutral sans.)
