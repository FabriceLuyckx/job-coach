## Why

The current "Print Shop" visual language (cream sheet on a dark teal wall, bordered
cards everywhere, hard offset shadows, blanket-uppercase Inter) reads to the owner as
generic AI design. Cards, cream grounds, soft drop-shadows, side-stripe accents, glass,
and pill badges are the tells they explicitly want to escape. A studied redesign
explored form languages on the real Job Suggestions screen; the chosen direction is
**Atelier**: own a colour instead of hiding in neutral. The whole app lives in one
drenched, *lighter* colour world; listings share one tonal board split by hairlines
rather than a stack of cards; one warm accent is rationed to the primary action.

This is a cross-cutting visual refresh over the shipped frontend (Phases 4–5), not a new
phase and not a feature change. Resolved visual reference: the published Atelier /
Stone artifact.

## What Changes

- **Palette (BREAKING).** The cream/ink/vermilion/**teal-wall** identity is retired for
  the **Stone** world: a de-yellowed sage ground at three tonal values
  (`ground`/`board`/`surface`), deep-pine ink, a **terracotta** accent (replacing
  vermilion), and a pine **marker** green for match/success (replacing the teal ramp).
  There is no cream and no dark wall — the sidebar is a tonal step of the same ground.
- **No cards.** Listings become **one tonal board split by hairlines**; the bordered
  card grid is removed. Separation is tonal, never a 1px ink border round every item.
- **Depth is tonal, not shadow (BREAKING).** In-content surfaces separate by tone +
  hairline; the hard offset shadow and the floating page sheet are gone. Only overlays
  (modal/menu/toast) may cast a single soft float shadow.
- **De-badged (BREAKING).** A listing's meta becomes an inline monospace line, "match"
  becomes a marker + plain word, and the deadline becomes coloured mono text — no pill
  badges. The Badge primitive is reserved for genuine categorical labels.
- **Rounded, roomy form.** A radius scale: pill controls (`999px`), round panels/frame
  (`22`/`30px`); generous spacing.
- **Type.** System-sans body paired with **mono** for every data line (dates, meta,
  counts, the match marker); the blanket uppercase-heading transform is dropped.
- **Unchanged:** one-accent-per-view rationing, ink-underline content links, all WCAG AA
  thresholds, calm copy/motion, the shared primitives, and every existing feature.
- **Docs:** rewrite DESIGN.md and reconcile PRODUCT.md so "not generic SaaS" is redefined
  as *the drenched Stone world + rationed terracotta + calm register* — not the absence
  of radius/depth, and not the old Bauhaus/cream system.

## Capabilities

### Modified Capabilities
- `app-shell-visual-system`: retire the dark-wall AA and teal-ramp requirements; replace
  the shadow-based elevation rule with a **tonal-depth** rule; add requirements for the
  **drenched tonal ground**, a **light-sidebar AA** guarantee, a **rounded radius scale**,
  the **one-tonal-board (no cards)** listing pattern, and **text-not-badges** meta/status.
  Re-value **accent rationing** from vermilion to terracotta (deadline is coloured text,
  not a chip).

## Impact

- **Code:** `frontend/src/index.css` (token layer), `frontend/src/App.css` (shell/sidebar),
  shared primitives (Button/Badge/Modal/Toast/Collapsible/EmptyState) and component-local
  styles (CVEditor etc.), per-page audit (Profile, Preferences, Jobs, Applications,
  Settings, Onboarding).
- **CV templates** (`templates/cv/*`): out of scope — a separate user-themed system.
- **Docs:** DESIGN.md, PRODUCT.md, CLAUDE.md design-decision note, impeccable detector.
- **No** backend, API, data-model, or i18n-string changes; contrast re-verified via
  `scripts/check_contrast.mjs`.
