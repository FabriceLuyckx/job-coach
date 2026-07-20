# Design — expand-local-model-choice

## Context

Everything about the local engine already keys off one string: the registry id in
config as `local_model_id`. `local_model_path()` turns that id into a file in
`MODELS_DIR`, `require_engine()` treats that file's existence as "AI ready",
`local.py::_load()` reloads when the id changes, and `/api/engine/download`
already takes a `model_id`. The registry's own docstring anticipated this change:
*"the registry shape lets more be offered later without touching call sites."*

So the backend is mostly there. What is missing is (a) more than one entry,
(b) a place to put a model the user supplied, and (c) a frontend that stops
assuming `models[0]`. Both `Onboarding.tsx` and `EngineSettings.tsx` do
`api.listLocalModels().then(ms => setModel(ms[0] ?? null))` — that single line is
the whole single-model assumption on the client.

Constraints: models are multi-GB, so downloads must stay resumable and
interruptible; llama.cpp is serialized behind one lock and one resident model;
the app is localhost-only, but a user-pasted URL is still an untrusted input that
decides a filename on disk.

## Goals / Non-Goals

**Goals**
- Offer a curated set of local models distinguished by *purpose*, not size,
  spanning modest to capable machines.
- Let a user download, switch, and delete models from Settings, with several on
  disk at once.
- Let a user add a model the registry doesn't know, by URL.
- Never break an install that already downloaded the old default.

**Non-Goals**
- Model benchmarking, quality scoring, or auto-selection by machine specs.
- Quantization choice per model (each curated entry pins one quant — Q4_K_M).
- Multi-model concurrency: one resident model at a time stays the rule.
- Fetching a model list from a remote catalog at runtime. (See Decision 5.)

## Decisions

### 1. Curated set = 4 entries, chosen by purpose, spanning machine sizes

| id | role in the UI | approx. size (Q4_K_M) | rec. RAM |
|----|----------------|----------------------|----------|
| `qwen3-4b-instruct` | **Light** — for 8 GB machines; multilingual, quickest | ~2.5 GB | 8 GB |
| `qwen3-8b` | **Balanced (recommended)** — multilingual, the default | ~5.0 GB | 16 GB |
| `qwen3-14b` | **Stronger reasoning & writing** — better CVs and letters | ~9.0 GB | 24 GB |
| `gemma-3-12b-it` | **Alternative writer** — different family, strong prose | ~7.3 GB | 16 GB |

Rationale: the stated axis is "multilingual vs. better reasoning", so the list is
labelled that way rather than by parameter count — but a list whose smallest entry
is 5 GB silently excludes every 8 GB laptop, which is why the light tier is a real
entry and not a footnote about the RAM override. Four is enough to make a genuine
choice and small enough that every entry can be verified by hand. Sizes/RAM above
are estimates for the three new entries — the implementation task verifies each
repo id, filename and byte size against Hugging Face, exactly as the existing
registry NOTE requires (the official Qwen repo went gated once already, hence the
bartowski mirrors).

### 2. The light tier *is* the incumbent, so nothing needs retiring

`qwen3-4b-instruct` is the model this app already ships, already runs, and has
already proven under llama.cpp's grammar-constrained JSON. Making it the light
option rather than replacing it means: no new verification risk at the bottom of
the range, and — more usefully — **no legacy machinery at all**. Existing installs
have that id in config and its GGUF on disk; because the entry stays listed, they
simply keep working and see the new options beside it. No hidden flag, no
downloaded-but-unlisted special case, no migration script.

The rule for the day a curated model genuinely is retired: keep serving it while
it is downloaded or active, so an install never reads "not ready" for a model
sitting on its own disk. That is three lines to add *then*, and unwritten now.

*Alternative considered*: retire the 4B and add a different light model (Gemma 3
4B, Qwen3 1.7B). Rejected — it buys nothing but an unverified model and a legacy
code path.

### 3. Custom models live in config and merge into the registry

`config.json` gains `local_custom_models: {id: entry}`, where an entry has the
same shape as a curated one (`label`, `url`, `filename`, `size_bytes`,
`min_ram_gb`, `n_ctx`, `custom: true`). `registry.all_models()` returns
`LOCAL_MODELS | config customs`, and `get_model()`/`local_model_path()` read from
that. Because every call site already goes through those two functions, download,
delete, status, `require_engine` and `_load` need no change to support custom
models — this is the whole reason to put the merge in the registry rather than in
the API layer.

Curated entries keep `repo`/`filename` and resolve through `hf_hub_url()`; custom
entries carry a direct `url`. `_run_download` picks whichever is present — one
branch.

*Alternative considered*: a separate `custom_models` table/endpoint pair.
Rejected as CRUD for a dict that only ever grows by "download this URL".

### 4. Adding a custom model *is* downloading it

No separate registration endpoint. `POST /api/engine/download` accepts `url`
instead of `model_id`; the server validates, derives the entry, saves it to config
and starts the same download thread. `DELETE /api/engine/model?model_id=…` removes
the file and, for a custom entry, its config record. One new field, no new
endpoint.

**Validation (trust boundary — not lazy here):**
- scheme must be `https`
- path basename must end in `.gguf` and, after stripping to `[A-Za-z0-9._-]`, be
  non-empty; that sanitized basename is the on-disk filename, so traversal
  (`../`) and shell-hostile names cannot reach `MODELS_DIR`
- a Hugging Face `/blob/` URL is rewritten to `/resolve/` (the single most common
  user mistake — a `/blob/` link downloads an HTML page named `.gguf`)
- one `HEAD` request before starting: it proves the URL is reachable and yields
  `content-length` for the disk pre-check and the progress bar; failure returns a
  readable 400 rather than a broken background thread
- id is `custom-<sanitized-stem>`; re-adding the same file replaces the entry
  rather than duplicating it
- `min_ram_gb` is derived as `round(size_gb) + 2` (the file must fit in RAM plus
  context/overhead), so the existing RAM pre-check and its override still apply
- `n_ctx` defaults to 8192 — the conservative value; `ponytail:` comment marks it,
  with "make it a field if someone downloads a long-context model" as the upgrade

**Finding a model to paste.** The field is useless to anyone who doesn't already
know where GGUFs live, so it carries a link to the Hugging Face GGUF catalogue
(`https://huggingface.co/models?library=gguf&sort=trending`) next to the
"advanced, unverified" help line. A plain external link — the app has no business
proxying or mirroring a third-party catalogue, and a link cannot go stale the way
an embedded, scraped list would.

### 5. The curated list stays in code

A remotely-fetched catalog would make new models available without a release, but
adds a network dependency to a feature whose selling point is *offline*, plus a
signature/trust problem. The custom-URL path already covers "a model we don't ship
yet" for the user who wants it. Skipped; revisit if the list needs to change more
often than the app ships.

### 6. Frontend: one list component, two hosts

`EngineSettings` already contains exactly the right component for this: the
local/OpenRouter choice is a `radioGroup()` of `.engine-card`s in an
`.engine-grid`. Picking a model is the same kind of decision — one of N, mutually
exclusive — so the model picker is **a second `radioGroup()` in a second
`.engine-grid`**, nested one level under the provider choice, not a bespoke list.
`radioGroup`'s own docstring names this case ("engine, template, palette"), and
`.engine-grid`'s `repeat(auto-fit, minmax(220px, 1fr))` already absorbs four
options without a breakpoint or a fixed width.

That choice settles three things the design system would otherwise decide badly:

- **One selection vocabulary.** DESIGN.md's rule is *ink fill = chosen/active*,
  used by `.seg`, the template grid and the engine cards alike. A per-row list with
  its own selected treatment would put two selection languages on one card.
- **No third card layer.** The model options are siblings of the provider cards,
  inside the one `.card` — not cards nested in cards.
- **One primary action.** Selection lives in the radiogroup; the *action*
  (Download / Delete) is a single `Button` **below** the group, acting on the
  selected model. Four rows each with their own filled button would spend
  vermilion four times on a page whose accent is already rationed to one signal.

State per option is carried the way the current card already carries it: the
teal `--success` + `CheckCircle2` line for "downloaded and ready" (the existing
code comments explain why that is deliberately *not* accent-coloured), and plain
`.muted-sm` text for size and RAM. No new badge variants — `badge-*` fills are
spoken for (`badge-cv` accent, `badge-ai` teal, `badge-jobs` ink) and four filled
chips in a grid is exactly the noise the rationing rule exists to prevent.

Onboarding shows the same curated options in the same vocabulary — it sits
directly beneath the local/OpenRouter cards in the same step, so it must match its
neighbour rather than the accent-bordered language grid on the previous step. It
must stay a two-click path to a working engine, so the default comes preselected
and there is **no** custom-URL field (Settings is where that belongs).

Model display names/descriptions come from i18n keys (`engine.models.<id>.name` /
`.desc`), like `settings.template.names.<id>`, with the registry `label` as
fallback for custom entries (a user-supplied filename has no translation). Names
and blurbs wrap; nothing in the grid truncates, because German and Polish run
~35% longer than the English source.

Selection semantics in Settings: choosing a **downloaded** model writes
`local_model_id` immediately (it takes effect on the next AI call — `_load()`
swaps the resident model). Choosing a not-yet-downloaded model starts its
download and sets it active when it completes, matching today's behaviour.

**Progress stays a single instance.** One download runs at a time (the API
enforces it), so there is one `role="progressbar"` below the group, not one per
option — four bars sharing the label "Model download progress" would be
ambiguous to a screen reader, and only one could ever move. Its `aria-label`
gains the model name so it says *which* model is downloading. The existing
decision not to make it a live region stands, and the comment explaining why
must survive the refactor: the value ticks every second for minutes, and `polite`
queues rather than drops.

**The custom-URL field is a form field, with everything that implies**: a real
`<label>`, `type="url"`, `spellCheck={false}`, a `.help-text` line carrying both
the "advanced, unverified" caveat and the catalogue link. Validation failures
render in `.error-msg` beneath the field, where the user's eyes already are;
network/HTTP failures go to `toast.error` like every other request in the app.
The two are different things and the app already distinguishes them.

## Risks / Trade-offs

- **A curated repo goes gated or is renamed** (already happened once) → the
  implementation task verifies each URL at build time; a failed download surfaces
  the real HTTP error, and the custom-URL path is the user-side escape hatch.
- **Bigger defaults are slower and heavier** — 8B/14B on a modest machine means
  long generations → the light tier exists precisely for those machines, sizes and
  RAM are shown *before* download, the RAM pre-check still blocks-with-override,
  and every long generation already has Cancel.
- **Disk fills with several models** → each row shows its size and has Delete;
  the disk pre-check (1.5× size) still runs per download.
- **A custom GGUF may be broken, huge-context, or not instruction-tuned** →
  llama.cpp errors surface as the engine error they already are; the model is
  deletable. Documented in README as "advanced, unverified".
- **Custom URL = arbitrary HTTPS fetch by the server.** Localhost-only today, and
  it is the user's own machine fetching a file they typed. It is still an SSRF
  surface, so it is added to the CLAUDE.md Phase-7 security prerequisites list
  alongside the existing job-URL fetchers rather than being silently exempt.

## Migration Plan

1. Ship the registry with all four entries and the new default `qwen3-8b` in
   `config._DEFAULTS`.
2. An existing install keeps its explicit `local_model_id` in config.json, so it
   keeps running the 4B it already downloaded — now listed as the light option,
   with the new models beside it and no prompt to move.
3. A fresh install gets `qwen3-8b` as the preselected default.
4. Rollback: revert the registry default; no data migration ran, and any
   downloaded GGUF is just a file in `MODELS_DIR`.

## Open Questions

- Exact repo ids, filenames and byte sizes for the three *new* curated entries —
  to be confirmed against Hugging Face during implementation (task 1.1), not
  guessed here. The light entry is already verified: it is what ships today.
- Whether `gemma-3-12b-it` holds up under llama.cpp's grammar-constrained JSON as
  well as Qwen3 does; if it doesn't, it is dropped from the curated set rather
  than shipped as a trap (task 1.2 smoke-checks one forced-tool call per model).
