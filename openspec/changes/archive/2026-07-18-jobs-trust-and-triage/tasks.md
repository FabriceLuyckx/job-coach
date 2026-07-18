## 1. Trust & legibility (P1a — do first)

- [x] 1.1 Remove the `opacity: 0.7` on filtered-out cards and `opacity: 0.55`
      on rejected history rows in `Jobs.tsx`.
- [x] 1.2 Add a "decided row" treatment in `index.css` using a
      `--surface-dim` fill (DESIGN.md's nested-panel step-down) and apply it to
      filtered-out and rejected rows; verify the reason text renders at full
      `--muted` contrast (≥4.5:1 on the new background).
- [x] 1.3 Confirm each decided row still carries its verdict icon **and** its
      "Accepted"/"Rejected" text label, so state is never opacity/colour-only.
- [x] 1.4 Move the "non-matches are kept with their reason and can be restored"
      explanation out of the `filteredOut.length > 0` conditional so it shows on
      first run; add/adjust the `en.json` copy it needs.

## 2. Rationed accent (P1b)

- [x] 2.1 Change the suggestion card's Accept to `variant="secondary"` in
      `Jobs.tsx`.
- [x] 2.2 Audit the page's remaining vermilion (scan button, `badge-deadline`,
      profile-changed nudge) and confirm exactly one accent action per page
      state; leave `badge-deadline` as-is (open question in design.md).

## 3. Accept in place (P1c)

- [x] 3.1 Drop the automatic `navigate('/applications')` from `accept()`;
      keep writing the `application_pending` handoff key.
- [x] 3.2 Mark the accepted row in place with an inline "generating CV and
      letter…" state and an explicit "View application →" link; add `en.json`
      copy.
- [x] 3.3 Add an Undo affordance to the accept toast, mirroring the existing
      reject-undo pattern.
- [x] 3.4 Verify `busy` state clears on success now that the component no
      longer unmounts via navigation.

## 4. Status region (P2a) and Cancel bug (Bug 1)

- [x] 4.1 Add one status strip under the page title with `role="status"`,
      owning scan/re-check progress and Cancel. Deviation from design.md: the
      source-error list stays in the Sources card, next to the sources it names,
      rather than being hoisted into the strip — the spec only requires
      *progress* to live in the region, and errors read better in context.
- [x] 4.2 Move Cancel and progress out of the `filteredOut.length > 0` block so
      they depend only on work being in progress (fixes the stuck-Cancel bug).
- [x] 4.3 Give the scan/re-check controls stable labels with a `busy` state
      instead of replacing their text with progress.

## 5. Semantics, input safety (P2b) and error attribution (Bug 2)

- [x] 5.1 Promote the region titles to `<h2 className="section-title">` — done for
      Sources, Suggestions, Check a specific job, and History. The fifth
      ("Filtered out") is the `Collapsible`'s own toggle `<button>`; a heading
      inside a button is invalid HTML, and the button already announces its name
      and expanded state. Left as a `<span>`; giving `Collapsible` an optional
      heading wrapper is a shared-component change for a later pass.
- [x] 5.2 Add `type="url"` to the source-URL and check-a-job inputs.
- [x] 5.3 Make the two URL inputs' differing purposes clearer (placement and/or
      copy) so they are not two identical-looking boxes.
- [x] 5.4 Key `sourceErrors` by source id instead of hostname-derived name, and
      clear it at the start of a re-check as well as a scan.

## 6. Verification

- [x] 6.1 `npx tsc -b` clean.
- [x] 6.2 Confirm the changed modules transform without error in the Vite dev
      server.
- [x] 6.3 Re-run `/impeccable critique Suggestions` and confirm the score moves
      off 27/40 with no new regressions introduced. Ran three passes: 27→24
      (round 1 fixes verified, round 2 exposed a spinner regression + a
      trust-copy gap) →29 (round 2 fixes verified, round 3 caught 4 more
      regressions, all fixed in section 8). Scores across reviewers aren't
      directly comparable, but every finding raised was resolved or explicitly
      deferred.

## 7. Documentation

- [x] 7.1 Update CLAUDE.md's Job Suggestions section for the accept-in-place
      behaviour (no auto-navigation) and the status region.

## 8. Follow-up round (from the 2nd and 3rd critique passes)

- [x] 8.1 Accepted row: drop the unresolvable spinner for a static, verifiable
      state ("Accepted — see it on Applications"); this page never polls the
      generation, so it cannot honestly report progress.
- [x] 8.2 Reason-less filtered rows explain themselves (`filteredByTitle`)
      instead of rendering bare under help text that promises a reason.
- [x] 8.3 Gate Re-check on a server-supplied `recheckable` count so it can't
      examine zero rows and still report "no filtered jobs match"; surface the
      reason as visible text, not a `title` on a disabled button.
- [x] 8.4 Contrast: `--muted` #6E6A5E → #666256 and `--highlight` #8F6B0C →
      #7C5C08; every text token now clears AA on every ground it sits on.
      DESIGN.md + design.json synced.
- [x] 8.5 Coarse `aria-live` for scan progress; live region moved onto the
      persistent Toast stack so completions are announced at all.
- [x] 8.6 Status strip sticky (and no longer escaping the page sheet).
- [x] 8.7 Trust note moved out of the collapsed drawer to a permanent line
      above it; `filterTrustNote` removed.
- [x] 8.8 Plain-language source errors (`_source_error`) instead of raw
      exception strings.
- [x] 8.9 Digest on filtered rows + screen-reader labels on digest chips.
- [x] 8.10 Server guard: `_start_or_attach()` re-attaches to an in-flight
      scan/re-check instead of starting a concurrent one, with tests.
- [x] 8.11 Disclose that Accept spends AI credit; clear-filters action on the
      filtered empty state; "Check a specific job" moved below History; reject
      of an accepted job discloses its CV/letter are kept.
