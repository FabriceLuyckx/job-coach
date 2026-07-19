---
target: Applications page
total_score: 30
p0_count: 0
p1_count: 0
timestamp: 2026-07-17T17-00-23Z
slug: frontend-src-pages-applications-tsx
---
Method: dual-agent (isolated sub-agents — Assessment A: Design Review, Assessment B: Detector + Browser Evidence). Re-critique after fixes; prior run scored 26/40.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3/4 | Rich (spinners, per-stage text, Saving/Saved, Done lines); spinners mid-content rather than skeletons |
| 2 | Match Between System / Real World | 3/4 | Plain natural copy; "Sections & options" is a vague catch-all label |
| 3 | User Control and Freedom | 4/4 | Cancel on every long op (client + server), Undo on deletes, Esc/backdrop modals, confirm-before on destructive lang change, revert-on-failure |
| 4 | Consistency and Standards | 3/4 | Icon system now fully Lucide (fixed); tab strip uses aria-pressed toggle semantics not role=tablist; heavy inline styles |
| 5 | Error Prevention | 3/4 | Confirm before letter-deleting lang change (new), autosave, disabled Generate until valid, type=url |
| 6 | Recognition Rather Than Recall | 3/4 | Tabs carry created/not-created icons + labels; section removal now hidden behind a collapsed disclosure (slight recall cost to find) |
| 7 | Flexibility and Efficiency | 3/4 | Cmd+B/I, Enter-to-generate, per-listing language, cancel; no cross-application bulk actions |
| 8 | Aesthetic and Minimalist Design | 3/4 | Main fix landed — CV tab opens on preview + actions + editor, controls collapsed. Still long (80vh preview + editor); inline-style density remains. Up from 2 |
| 9 | Error Recovery | 3/4 | error-msg near source, plain-language errMsg, retry on load error, revert on relang failure |
| 10 | Help and Documentation | 2/4 | Thin; the one genuinely instructive nudge (no-photo) got buried by the collapse fix |
| **Total** | | **30/40** | **Good — up from 26/40** |

## Anti-Patterns Verdict

**LLM assessment:** Not slop. The Print Shop system is applied consistently — zero-radius, ink hairlines, `.seg` ink-fill selection, and now fully Lucide iconography (the raw `✓`/`—` glyphs are verified gone, replaced by `Check`/`Minus` in both `progressLine` and `tabBtn`). No SaaS-gradient chrome, no chat-bot AI persona, no sparkle-decoration (the one `Sparkles` icon labels the AI re-tailor action, defensible). The page's only failure axis is density, which the collapse fix directly attacked.

**Deterministic scan:** `detect.mjs` ran clean — **0 findings** on the four target files AND on the whole `frontend/src/pages` dir (exit 0 both times), confirming the empty result is trustworthy, not a no-op.

**index.css toast borders (carried over):** Assessment B confirmed the earlier hook flag (`border-left: 3px` on `.toast-success/-error/-info`) sits on floating toast severity indicators, not content cards. DESIGN.md sanctions toast severity coloring (info toasts → Mustard) and names the only *intentional* 3px left-border as the active nav tab; the toast stripe is neither named nor prohibited. Contextual false positive; pre-existing, untouched by this pass.

**Visual overlays:** Unavailable — no mutable browser/screenshot tool in either sub-agent this session. Source-level review, not rendered.

## Overall Impression

The fixes are real, not cosmetic. Score up +4 to the Good band, driven by three verified wins: the CV tab no longer opens as a wall (heuristic 8, 2→3), the Rationed Accent Rule now holds with exactly one vermilion primary per view, and the language change converts a silent destructive surprise into an informed confirm (heuristics 3/5). The residual floor is Help & Documentation — dragged *down* this round because the collapse was a touch too aggressive and buried the one instructive nudge on the CV tab. The single best next move is splitting transient state-nudges (always visible) from recurring controls (collapsible), which un-buries the help without rebuilding the wall.

## What's Working

1. **Cancellation + undo discipline is pervasive and honest.** Every long AI op has a Cancel that aborts the poll AND frees the single local engine; every delete has Undo; relang reverts the language control on failure so a retry re-fires only the lagging artifact. The "calm, forgiving" brand personality implemented in code, not just copy.
2. **The Collapsible fix genuinely de-walls the CV tab.** CVEditor now surfaces preview → primary actions → content editor, with toggles/AI-decision chips/photo nudge behind one collapsed "Sections & options". Verified nothing destructive is hidden, only secondary controls.
3. **Rationed Accent Rule now holds.** Traced an expanded row: header "+ New application" is secondary, tab selection is ink-fill, Download secondary, Refresh ghost, delete-X ghost — leaving exactly one vermilion primary. Empty-state CTA stays primary but only renders when no rows exist.

## Priority Issues

**RESOLVED from prior critique (all verified in source):**
- CV-tab wall of controls → collapsed disclosure.
- Two vermilion CTAs → header dropped to secondary; one primary per view.
- Raw `✓`/`—` glyphs → Lucide `Check`/`Minus`.
- Silent letter deletion on language change → confirm Modal gates it when a letter exists; CV-only change runs straight through; no stuck-select bug (LangSelect value stays old until confirm, so Cancel snaps back).

**[P2] The no-photo nudge was buried by the collapse fix (new regression).** The `!hasPhoto` callout in CVEditor now lives *inside* the collapsed "Sections & options" disclosure. A user who never uploaded a photo gets no visible signal their CV renders without one unless they expand a secondary panel. It's the one piece of instructive, action-linked help on the CV tab (links to Settings) — exactly what a first-timer needs surfaced. **Fix:** render the photo nudge outside/above the Collapsible (it's a one-time state, not a recurring control); keep only toggles + AI-decision chips inside.

**[P2] Section-removal discoverability dropped.** To hide a CV section (e.g. Teaching), the user must open "Sections & options" — a vague label that doesn't announce it's where CV-section visibility lives. The wall was at least visible. **Fix:** rename `cveditor.moreOptions` to name the payoff ("Sections shown on this CV") or show a count in the collapsed header ("6 of 9 sections shown") so it reads as content control, not misc options.

**[P2] Inline-style density remains high (consistency/maintainability, not visual).** Both files carry dozens of inline style objects, several off the spacing scale: `gap: 6`/`gap: 8`, `padding: '11px 16px'`, `marginTop: 10`, `verticalAlign: -2` re-typed 10+ times. The `.chip-check` extraction fixed one. Not a call for a sweeping refactor — the smallest-correct-change stance holds for one-off glue — but the repeated `verticalAlign: -2` nudge and `gap` literals are the same value re-typed many times and would each collapse to one class. Fix opportunistically.

**[P3] Tab strip uses toggle-button semantics, not tabs.** `tabBtn` renders `<button aria-pressed>` inside `.seg`; functionally it's a two-panel tab set. SR users get "pressed/not pressed" instead of "tab 1 of 2, selected." The new `aria-label` is a real improvement, but `role=tablist/tab/tabpanel` + arrow-key movement is the correct pattern. Low impact at two options; note for later.

## Persona Red Flags

**Alex (power user):** Mostly served (Cmd+B/I, Enter-to-generate, Cancel everywhere, per-listing language). Residual: no cross-application bulk actions; the new language-change confirm modal adds a click with no "don't ask again," so a power user who knows it deletes the letter eats the modal every time (the "redundant confirmation for low-risk action" flag — though the action isn't low-risk).

**Sam (accessibility):** *Improved* — the tab `aria-label` means SR users now learn whether each artifact exists (**prior red flag resolved**). Modal has focus trap, Esc, focus-return. Residual: tab semantics are aria-pressed not role=tab; form inputs/selects use `outline:none` with only a border-color shift to vermilion on focus — a color-only focus signal, thin for low-vision users (buttons keep the visible UA outline, which is fine).

**Jordan (first-timer):** Residual: the buried photo nudge (P2) — Jordan is exactly who needed to see it; "Sections & options" doesn't announce where CV-section control lives (P2); the letter-tab explainer is one bold headline, may not convey *why* it's a guide-not-a-letter. Empty state and progress feedback serve Jordan well.

## Minor Observations

- `NewApplicationSlot` checkbox labels use inline `gap: 6` (off-scale) — same target the `.chip-check` extraction addressed elsewhere, missed here.
- The letter-tab explainer callout renders on *every* letter view, even for a returning user who's seen it 20 times — consider one-time/dismissible.
- `expandedRows`/`rowTabs` module-level Set/Map are pragmatic and already carry a `ponytail:` upgrade note. Good.
- Confirm-modal copy (`changeLangBody`) is clear and honest about both effects (regenerate letter + re-tailor CV, edits kept). Well written.

## Questions to Consider

1. Should the photo nudge and the section toggles share one disclosure at all? One is a transient onboarding hint (fix once, gone), the other a recurring control. Collapsing them together is what buried the hint — would splitting "state nudges" (always visible) from "controls" (collapsible) be the cleaner cut?
2. Does the language change need a modal, or an inline confirm strip? The product-register ref lists "modal as first thought" as an anti-pattern. An inline "Change to Dutch? This regenerates the letter. [Change] [Cancel]" bar under the LangSelect would honor the same safety while feeling lighter and sparing Alex the overlay.
3. What names the "Sections & options" panel by its payoff? If the collapsed header showed "6 of 9 sections shown," would users discover section control without opening it — turning a hidden panel into a glanceable status?
