## Context

Four related edits to one page. `frontend/src/pages/Preferences.tsx` already owns a
`Suggestions` component (dashed one-tap chips) used by the dealbreakers question; three of
the four changes are about pointing more of the page at it, and the fourth removes a field
that duplicates profile data.

Constraints already in place that this change must not break:

- `_trimmed_profile()` (`app/services/job_scanner.py`) already ships **whole**
  `skills` — including `skills.languages` with CEFR levels — into every relevance call.
  The scanner therefore already sees the user's languages; `preferences.languages` was
  adding a second, less precise copy to the same prompt. Removing it costs the matcher
  nothing.
- `normalize_profile()` is the one migration boundary and must stay idempotent.
- `role_brief()` is the only other consumer of `prefs["languages"]`.

## Goals / Non-Goals

**Goals**

- Give Q1 (target titles) and Q3 (great match) the same one-tap help Q4 already has.
- One source of truth for working languages.
- Guarantee the profile always carries language data.

**Non-Goals**

- No scoring/ranking work (that is Phase 6).
- No new suggestion mechanism for locations, working style, or practical notes.
- No change to how the scanner prompts or weighs languages — it already reads `skills`.

## Decisions

### 1. `Suggestions` becomes source-agnostic; callers own the append

Today `Suggestions` takes `value: string` and does free-text joining internally. Q1 appends
to a `string[]`, so the component needs to stop assuming a string.

New props: `{ items, added, onPick, label }` where `added: (s: string) => boolean` and
`onPick: (s: string) => void`. The free-text join logic moves out to a module-level
`appendPhrase(value, phrase)` helper, called by the two textarea questions (Q3, Q4). Q1
passes `added: s => p.target_roles.includes(s)` and
`onPick: s => set('preferences.target_roles', [...p.target_roles, s])`.

*Alternative rejected*: a second `TagSuggestions` component. Two components, one behavior,
and the chip styling would drift.

The existing casing/separator rules and the whole-phrase `added` test for free text move
into `appendPhrase` unchanged — they were hard-won (see the comments in the current file)
and are not being redesigned here.

One behavior does change: the already-added state moves from `disabled` to
`aria-disabled` (with a guarded click handler and a `[aria-disabled="true"]` CSS
selector). A `disabled` button drops keyboard focus to `<body>` the moment it is
activated; that was survivable with one chip row and is not with three. The chip also
gains vertical padding — at 13px it currently measures ~24px tall, exactly the WCAG 2.2
target-size floor, and this change triples how many of them a user taps.

### 2. Title suggestions: one synchronous endpoint, no job store

`POST /api/profile/suggest-titles` → `{ titles: string[] }`. One forced-tool `complete()`
call over the profile's experience titles/employers, skills and professional title, capped
at ~8 titles, `max_tokens` small.

Synchronous rather than the `run_async` + poll pattern the CV/letter routes use. The output
is a handful of short strings — comparable to `POST /api/cv/detect-lang`, which is already
sync for the same reason. A `ponytail:` comment marks the ceiling: if a slow local engine
starts timing out this call, move it onto the existing async job store rather than adding a
new mechanism.

Returns 400 with the missing-data reason when the profile has no experience and no
professional title, so the client can say what to fill in rather than showing an empty
chip row. The client mirrors that check only to disable the button — the server is the gate.

Suggestions are cached client-side in `localStorage` and restored on mount. They
were originally specified as un-persisted ("a nudge, not state; a re-tap re-asks"),
which was wrong in use: every return to the page threw away a real LLM call, in an
app that otherwise goes to some length to pay for expensive text exactly once.

The cache is deliberately **not** invalidated when the profile changes. Auto-clearing
would silently empty a chip row the user had been working from, and auto-refreshing
would spend a call they didn't ask for — the button is the only thing that
regenerates. Stale titles are cheap: every one still requires an explicit tap to
enter `target_roles`, and the list is visibly the user's own past request.

### 3. Languages: `skills.languages` is the source, Preferences displays it

Q2's languages `TagInput` is replaced by a read-only list of the profile's language names
plus a link to `/profile`. `Preferences.languages` is deleted from `types.ts`.

Migration in `normalize_profile`, at the point `preferences` is finalized:

```
langs = p["preferences"].pop("languages", None)
if langs and not any(l.get("language") for l in p["skills"]["languages"]):
    p["skills"]["languages"] = [{"language": name, "level": 3, "label": CEFR[3]} for name in langs]
```

Level 3 is a deliberate neutral guess — `preferences.languages` was a bare tag list with no
proficiency, and the Profile page is where the user corrects it. `pop` runs unconditionally,
so a profile already migrated (or one where `skills.languages` was already filled) still
loses the dead key, which is what makes the migration idempotent.

`role_brief()` composes its working-languages line from
`[l["language"] for l in skills.languages if l.get("language")]`.

### 4. Required languages: seed one row, mark the section

`blank_profile()` seeds `skills.languages` with one empty row (`{language: "", level: 3,
label: CEFR[3]}`) so the section never renders as an empty void.

The Profile page marks the section as unanswered while no entry has a name. `Section` gains
an optional `required?: boolean` rendering a new **mustard** (`--highlight`) `Badge`
variant next to the existing section badge, and appending the same text to the collapsible
toggle's accessible name so a collapsed section still announces it.

The color is forced: the languages section already carries a vermilion `cv` badge, and a
second accent badge in the same row breaks the Rationed Accent Rule. `--danger` would be
wrong too — unanswered is not an error. Mustard is what DESIGN.md scopes to exactly this
job, with two precedents already in the codebase (`.q-sub.q-end-warn`, the profile-changed
nudge chip).

No blocking, no save gate: autosave has no submit step to block, and a hard gate on a page
the user may be filling in over several sittings would be hostile. `profile_ready()` is
deliberately **not** extended — a missing language should not block the generic application,
which is about roles and experience.

## Risks / Trade-offs

- **Bad AI titles pollute `target_roles`.** Mitigated by the interaction: every title is an
  explicit tap, and `TagInput` already supports removal. Nothing is auto-added.
- **The level-3 guess is wrong for most migrated users.** Accepted: it is visible and
  editable on the Profile page, and the alternative (dropping the values, or inventing a
  "level unknown" state the CV template would have to render) is worse.
- **Removing a schema key without a version bump.** The v5 schema string stays. `pop` in
  `normalize_profile` is the same mechanism v5 already uses for `work_preferences` and
  `narrative`; the field was write-only from one page and has one other reader.

## Migration Plan

No user action. Existing `profile.json` files migrate in memory on first load and persist
the new shape on the next autosave, exactly as v1→v5 already do.

## Open Questions

None.
