---
target: the installation wizard
total_score: 26
p0_count: 0
p1_count: 2
timestamp: 2026-07-21T09-08-45Z
slug: frontend-src-components-onboarding-tsx
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Download shows only %, no size/ETA; step change not announced |
| 2 | Match System / Real World | 3 | "OpenRouter API key (sk-or-…)" jargon, but linked & friendly local framing |
| 3 | User Control and Freedom | 2 | Back present; no path forward if an engine genuinely can't be set up |
| 4 | Consistency and Standards | 2 | Two selection vocabularies in one flow; native confirm vs ConfirmModal; hand-rolled overlay vs Modal |
| 5 | Error Prevention | 3 | Next gated on working engine, model preselected, RAM pre-check |
| 6 | Recognition Rather Than Recall | 3 | Options visible/labeled; "Other" language needs code recall |
| 7 | Flexibility and Efficiency | 2 | Recommended model one-click; no keyboard accelerators |
| 8 | Aesthetic and Minimalist Design | 3 | Clean, but accent overspent on step 0 |
| 9 | Error Recovery | 2 | Download errors surface; "Other language" failure is silent |
| 10 | Help and Documentation | 3 | Key link + friendly copy + done-step next actions |
| **Total** | | **26/40** | **Acceptable — solid bones, consistency is the drag** |

## Anti-Patterns Verdict

Not AI-slop; passes the product slop test. Restrained three-step wizard. The trust-eroders are the raw OS window.confirm and two different "selected" idioms inside one modal. Detector clean (no side-stripes/gradient-text/glass/eyebrow). Detector can't see the cross-component inconsistencies, which is where the real issues are.

## What's Working

1. Engine step reuses EngineCard/ModelRow verbatim from Settings — ink-fill selection, recommended model preselected for one-click accept. Most consequential decision speaks the app's own vocabulary.
2. Honest completion semantics: finish() is the only writer of onboarding_done, no skip, abandoned setup re-offers rather than shipping broken.
3. Done step teaches next action (Profile -> Job Suggestions) instead of dead-end "Done."

## Priority Issues

- [P1] Two selection vocabularies in one flow. Step 0 language buttons use border:2px solid accent + check; step 1 engine cards use ink-fill data-selected — the pattern EngineCard's own comment says replaced accent-borders. Also re-spends rationed accent on step 0 competing with the accent Next button. Fix: ink-fill data-selected on language buttons; consider shared SelectableCard. Command: /impeccable polish
- [P1] Hand-rolled overlay drops app modal a11y. Bare position:fixed div — no role=dialog, no aria-modal, no focus-into, no Tab trap — while Modal.tsx provides all four. Keyboard/SR users can tab into obscured app. Fix: add role/aria-modal/aria-labelledby + focus management + trap, or non-dismissable Modal variant. Command: /impeccable harden
- [P2] Native window.confirm for RAM override on first-ever screen breaks print-styled system; Settings uses ConfirmModal for identical decision. Fix: reuse ConfirmModal / shared helper. Command: /impeccable harden
- [P2] Longest wait least reassured. Download shows only "Downloading… 34%" (no GB/ETA) vs Settings' GB done/total. Emotional low point of first-run. Fix: reuse Settings progress copy + "few minutes" line. Command: /impeccable clarify
- [P2] "Other language" fails silently. finish() fires generateLocale().catch(()=>{}) then closes claiming success; failure leaves user in English with no feedback after being promised translation. Fix: surface progress/failure or defer to Settings. Command: /impeccable harden

## Persona Red Flags

- Jordan (First-Timer): OpenRouter path leans on jargon while local path is plain language; asymmetry nudges by confusion.
- Sam (a11y): no dialog role, no focus trap, no focus-into on open/step-change, no aria-live on step change.
- Pat (non-technical self-hoster): 4-minute download bar with no size/ETA is the most likely force-quit moment; low-RAM users meet a naked OS dialog first.

## Minor Observations

- langOtherHelp defined + translated into all 8 locales but never rendered (component uses langQueued). Dead string.
- "Other" input placeholder "sv, ja, ar…" hardcoded, not t()-wrapped.
- Onboarding progress bar: no border + accent fill; Settings: 1px ink border + ink fill. Same widget, two looks.
- Step indicator text-only (Step 1 of 3); a 3-segment ink rule would strengthen progress at low cost.
- Inline fontFamily var(--font-display) on h2s is redundant (global rule already applies).

## Questions to Consider

- If step 0 and step 1 shared one selection component, could a third choice ever drift again?
- What does the download screen look like at minute three on a slow disk — wait, or force-quit?
- Is "Other language" a promise the wizard can keep at that moment, or should it defer to Settings?
