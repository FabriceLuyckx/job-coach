## 1. License files & metadata

- [x] 1.1 Add `LICENSE` at repo root: `curl -o LICENSE https://www.gnu.org/licenses/agpl-3.0.txt` (verbatim, unmodified)
- [x] 1.2 Add `license = "AGPL-3.0-or-later"` to `[project]` in `pyproject.toml`
- [x] 1.3 Add `"license": "AGPL-3.0-or-later"` to `frontend/package.json`

## 2. Header script

- [x] 2.1 Create `scripts/add_license_headers.py` (stdlib-only, ~40 lines) per design.md decision 5: argv paths; covered suffixes `.py/.ts/.tsx/.sh`; excluded path prefixes; skip if `SPDX-License-Identifier` in first 5 lines; insert 2-line header (`#` or `//` per suffix) after shebang else at line 1, plus one blank line; print changed paths; always exit 0
- [x] 2.2 Verify idempotence: run it twice on `app/main.py` — second run prints nothing

## 3. Backfill

- [x] 3.1 Run `git ls-files '*.py' '*.ts' '*.tsx' '*.sh' | xargs uv run python scripts/add_license_headers.py`
- [x] 3.2 Spot-check the diff: `setup.sh` and `scripts/generate_cv.py` keep `#!` on line 1; `frontend/src/main.tsx` has `//` header; `frontend/src/locales/*.json` and `templates/cv/*.html` untouched
- [x] 3.3 Confirm the app still runs (`uv run pytest` passes; frontend builds or dev-serves)

## 4. Pre-commit hook

- [x] 4.1 Append the header block from design.md decision 6 to `scripts/hooks/pre-commit` (extend the existing file — do NOT create a new hook file or add a hook framework)
- [x] 4.2 Verify: stage a scratch header-less `.py` file, commit, confirm the committed file starts with the SPDX header; then remove the scratch file

## 5. Docs

- [x] 5.1 Add a License section to `README.md` (AGPL-3.0-or-later, link to LICENSE, note the network-use source obligation)
- [x] 5.2 Update CLAUDE.md: note the license and that the pre-commit hook also maintains SPDX headers (and that the app footer's repo link satisfies AGPL §13 — don't remove it)
