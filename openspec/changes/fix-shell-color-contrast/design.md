## Context

The visual system is a two-surface composition: a cream poster sheet
(`--paper`) hung on a wall (`--frame`). Every colour on the sheet was audited
and carries a comment recording the value that failed and the measured ratios
that replaced it (`index.css:21-24`, `:29-33`, `:42-44`). The wall was never put
through that process, and it is the only surface where text fails.

The failures are not independent bugs. `--frame` `#6B8F91` sits at L≈58%, the
one band that can carry neither dark nor light text at AA. Measured against the
values actually in `App.css` (which composite `--paper` via `color-mix`, not
white):

| Element | Ratio | Required |
|---|---|---|
| nav inactive (`paper 82%`) | 2.58:1 | 4.5:1 |
| nav hover / wordmark (`paper 100%`) | 3.06:1 | 4.5:1 |
| footer text (`paper 70%`) | 2.27:1 | 4.5:1 |
| AGPL §13 link (`paper 100%`) | 3.06:1 | 4.5:1 |
| active-tab stripe (`--accent`) | 1.42:1 | 3:1 |

Pure `#FFFFFF` on this ground reaches only 3.52:1, so no text-side change fixes
it. The wall's lightness is the defect.

Both candidate directions were rendered against the running app and screenshotted
before this document was written; the wordmark defect below was found that way,
not by reading CSS.

## Goals / Non-Goals

**Goals:**

- Every persistent shell element clears WCAG AA, satisfying PRODUCT.md's stated baseline.
- Preserve the print-shop North Star — the sheet/wall composition, hard offset shadow, and flat colour all survive intact.
- Reduce the palette. This change should remove a token and a warning label, not add complexity.
- Make the Rationed Accent Rule true in the code rather than aspirational in the spec.

**Non-Goals:**

- The onboarding-wizard rework, card-in-card tone step-down, prose measure cap, and DESIGN.md disabled-contrast correction. Separate findings in the same critique snapshot; each stands alone.
- Any change to the cream sheet's palette. It passes and is left untouched.
- Dark mode. The wall going dark is not a theme; it is one token's value.
- Sidebar responsive/mobile behaviour, still explicitly deferred.

## Decisions

### Deep teal `#1E3A38` over pure ink, and over lightening the wall

Three directions were considered.

**Lighten the wall / lighten the text** — rejected on arithmetic. AA at 14px is
unreachable on `#6B8F91` from the text side, and a *lighter* wall would erase
the contrast that makes the cream sheet read as a distinct object.

**Pure ink `#1C1A16`** — viable and the highest-contrast option (15.09:1). It is
the only candidate where the vermilion stripe would clear 3:1. Rejected because
it removes teal from the shell entirely, leaving cream/ink/vermilion; the
rendered comparison read as neutral dark chrome, drifting toward the "generic
SaaS" and tool-shaped anti-references in PRODUCT.md, and the sidebar visually
outweighed the content.

**Deep teal `#1E3A38`** — chosen. It clears AA everywhere with headroom, keeps
the hue that carries the brand, and lets the shell colour join `--teal` as one
ramp instead of shadowing it. Galleries and print shops hang work on dark walls
precisely so the paper reads as figure, so this sharpens the North Star rather
than compromising it.

Derived values: nav inactive at `paper 75%` (6.74:1) rather than the current 82%
— with this much headroom the nav can be *more* subordinate than before while
still passing. Footer at `paper 80%` (7.44:1). Nav hover background flips from
`ink 14%` to `paper 10%` (1.32:1); on a dark ground an ink wash is invisible.

### A second shadow token rather than one adaptive value

`--shadow-pop` is ink at 18% opacity, computing to 1.08:1 on the new wall —
gone. Rather than lighten it globally (which would degrade the modal and menu
shadows that currently work correctly on cream at 1.44:1), a second token
`--shadow-pop-wall: 6px 6px 0 #0D1918` is introduced for the page sheet only.
At 1.47:1 against the wall it matches the perceptual weight the modal shadow has
today.

This is the one place the change adds rather than removes. The alternative —
dropping the sheet shadow entirely on the grounds that a 10.62:1 value step
already separates figure from ground — is defensible and simpler, but discards a
documented signature of the system for no gain.

### The wordmark's `em` becomes `--accent`

`App.css:26-29` renders "JOB **COACH**" with its second word in `--ink`. This
silently depends on the wall being light. Screenshots confirmed the failure:
at `#1E3A38` "COACH" drops to 1.42:1, and on an ink wall it disappears entirely.

`--accent` is chosen over plain `--paper` because a vermilion second word is a
legitimate rationed-accent use — a brand mark is exactly the kind of single,
deliberate placement the rule protects — and it recovers identity colour that
removing the active-tab stripe gives up.

### Removing the active-tab stripe strengthens two rules at once

At 2.45:1 on the new wall the 3px vermilion `border-left` still misses the 3:1
UI threshold, so it cannot stay as-is regardless. It is also redundant: the
cream tab carries "you are here" at 15.09:1 without it. Deleting it fixes a
contrast failure and returns a spent accent, rather than trading one for the
other. It also retires the codebase's only instance of impeccable's banned
side-stripe pattern.

### Links go to ink-plus-underline

`index.css:96` is a single rule with an app-wide blast radius: every `<a>` is
`--accent-text`. On a populated Jobs page that is 25+ vermilion elements against
a rule permitting one, and it silently defeats the accent discipline the
codebase fights for elsewhere (`SaveButton.tsx:53`, `Profile.tsx:771`,
`Settings.tsx:425`).

The underline is not decoration here — it is the non-colour affordance that lets
the link stop being accent-coloured without becoming colour-dependent.
`text-decoration-color: color-mix(in srgb, var(--ink) 45%, transparent)` keeps
it visibly a link while quieter than the current treatment.

## Risks / Trade-offs

- **A dark shell is a large perceived change for a "contrast fix"** → The composition, spacing, type, and every sheet colour are untouched; only the wall's value moves. Both directions were screenshotted on the live app before committing to one, and those images are the review artifact.
- **`--frame` may be referenced beyond the shell** → Grep `--frame` before editing. DESIGN.md currently instructs authors to keep it out of in-page UI, so in-page uses should be zero; any hit is a latent bug this change should surface rather than paper over.
- **Removing the stripe could weaken the active-route signal** → It does not carry that signal today (1.42:1 against the wall — effectively invisible). The 15.09:1 cream tab does. This makes an existing dependency explicit instead of creating one.
- **Ink links may read as less clickable to some users** → Mitigated by a persistent underline, which is a stronger and more accessible affordance than hue. Watch for links inside already-dense rows where the underline adds visual noise; if any surface suffers, the fix is spacing, not restoring the accent.
- **Screenshot verification used injected CSS, not built code** → Injection was chosen deliberately: an earlier attempt editing files was served stale from Vite's module cache and produced two identical, misleading screenshots. Implementation must re-verify against a real build, not trust the spike.
- **DESIGN.md and code can drift again** → The critique found DESIGN.md already asserting a disabled-contrast behaviour the code never had. Every ratio introduced here goes into the CSS as a comment beside its value, matching the existing convention, so the next reader can check the claim without recomputing it.
