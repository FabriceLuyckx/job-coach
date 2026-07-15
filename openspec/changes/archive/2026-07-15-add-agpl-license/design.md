## Context

The repo currently has no LICENSE and no per-file notices. The owner chose GNU AGPLv3. The full implementation plan was already written and reviewed in `docs/plans/agpl-license.md` — this design adopts it verbatim; that file is the reference if any detail here seems ambiguous. Git hooks live in `scripts/hooks/` (`git config core.hooksPath scripts/hooks`, set by setup.sh); the single `pre-commit` file there already runs locale translation.

## Goals / Non-Goals

**Goals:**
- Repo is validly AGPLv3-licensed: LICENSE text, package metadata, per-file SPDX notices.
- Compliance is self-maintaining: staged source files get headers at commit time with zero manual effort.

**Non-Goals:**
- CI enforcement of headers (the hook covers the only path code enters this repo; add CI if collaborators who skip hooks appear).
- Git-history rewriting, CLA, copyright-year automation, third-party license inventory.
- Any runtime/app behavior change.

## Decisions

1. **AGPL-3.0-or-later** (not `-only`) — the FSF-recommended "or any later version" form; standard default.
2. **2-line SPDX header, not the 13-line GNU boilerplate.** `SPDX-License-Identifier: AGPL-3.0-or-later` + `Copyright (C) 2026 Fabrice Luyckx`. Machine-readable, legally sufficient alongside the LICENSE file, minimal diff noise. Comment style per language: `#` for `.py`/`.sh`, `//` for `.ts`/`.tsx`.
3. **Covered suffixes: `.py`, `.ts`, `.tsx`, `.sh` only.** Excluded: `.json` (no comments; includes locale catalogs), `.html` (Jinja CV templates — a header would leak into every generated CV), `.css`, `.md`, config files, and generated/vendored dirs (`frontend/src/locales/`, `frontend/dist/`, `node_modules/`, `output/`, `models/`, `.venv/`).
4. **Extend the existing `scripts/hooks/pre-commit`, no new hook file, no hook framework** (user-confirmed decision — keep as planned). Git runs exactly one `pre-commit` file from the hooks path; a "separate hook" would either be a sub-script the existing file calls anyway, or a hook-manager dependency (`pre-commit`/husky) — both more machinery than a 3-line block appended to the file that already exists.
5. **Header insertion script: `scripts/add_license_headers.py`, stdlib-only, ~40 lines.** Takes paths as argv (empty argv ⇒ exit 0). For each existing UTF-8 text file with a covered suffix and no excluded path prefix: if `SPDX-License-Identifier` is absent from the first ~5 lines, insert the header — after a `#!` shebang line if present, else at line 1 — followed by one blank line, and print the path. Idempotent; always exits 0 (adding headers is never a commit-blocking failure). No flags, no dry-run, no year updating.
6. **Hook block** (appended to `scripts/hooks/pre-commit`, order vs. the translation block irrelevant):

   ```sh
   # Add missing AGPL/SPDX headers to staged source files, then restage them.
   files=$(git diff --cached --name-only --diff-filter=ACMR -- '*.py' '*.ts' '*.tsx' '*.sh')
   if [ -n "$files" ]; then
     echo "$files" | xargs uv run python scripts/add_license_headers.py
     echo "$files" | xargs git add
   fi
   ```

   `--diff-filter=ACMR` skips deletions. Known accepted caveat (same as the existing translation block): `git add` stages the whole working-tree file, sweeping in unstaged edits to an already-staged file.
7. **One-time backfill** via `git ls-files '*.py' '*.ts' '*.tsx' '*.sh' | xargs uv run python scripts/add_license_headers.py` — `git ls-files` respects .gitignore, so vendored/generated dirs never appear.
8. **AGPL §13** (network use must offer source) is already satisfied by the app footer's repo link — the design constraint is simply: don't remove that footer.
9. **LICENSE source**: `curl -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt` — verbatim, unmodified, filename exactly `LICENSE`.

## Risks / Trade-offs

- [Header script corrupts an edge-case file (BOM, unusual encoding)] → script only touches files it can decode as UTF-8; backfill diff is reviewed before committing; git makes any mistake revertible.
- [Shebang broken by insertion] → explicit shebang handling + verification step (`head -1 setup.sh` stays `#!`).
- [Hook silently sweeps unstaged edits into the commit] → pre-existing, documented behavior of this hook file; acceptable for a single-developer repo.
- [Contributor commits with `--no-verify`, file lands headerless] → next commit touching it re-headers it; no CI backstop by design (Non-Goal).

## Migration Plan

Single commit, no deploy/rollback concerns: LICENSE + metadata + script + hook edit + backfilled headers + README section land together. Revert = revert the commit.

## Open Questions

None — all decisions above were confirmed by the owner (including hook reuse).
