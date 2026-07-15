## Purpose

The repository is licensed under GNU AGPLv3. This capability keeps the
license text, package metadata, and per-file SPDX notices present and
accurate with no manual upkeep required as the codebase grows.

## Requirements

### Requirement: Repository carries the AGPLv3 license
The repository SHALL contain the complete, unmodified GNU AGPLv3 text in a root file named exactly `LICENSE`, and the license SHALL be declared as `AGPL-3.0-or-later` in `pyproject.toml` (`[project].license`) and `frontend/package.json` (`license`). `README.md` SHALL contain a License section referencing the LICENSE file and noting the AGPL network-use source obligation.

#### Scenario: License files present
- **WHEN** the repository is inspected at its root
- **THEN** `LICENSE` contains the verbatim AGPLv3 text, and both `pyproject.toml` and `frontend/package.json` declare `AGPL-3.0-or-later`

### Requirement: Source files carry an SPDX header
Every tracked source file with suffix `.py`, `.ts`, `.tsx`, or `.sh` SHALL begin (after an optional `#!` shebang line) with a 2-line comment header containing `SPDX-License-Identifier: AGPL-3.0-or-later` and a copyright line, using the file type's native comment syntax (`#` or `//`). Files under generated or vendored paths (`frontend/src/locales/`, `frontend/dist/`, `node_modules/`, `output/`, `models/`, `.venv/`) and non-commentable or user-facing formats (`.json`, `.html` templates, `.css`, `.md`) MUST NOT receive headers.

#### Scenario: Backfilled tree is compliant
- **WHEN** all tracked `.py`/`.ts`/`.tsx`/`.sh` files are checked after the one-time backfill
- **THEN** each contains `SPDX-License-Identifier: AGPL-3.0-or-later` within its first 5 lines

#### Scenario: Shebang preserved
- **WHEN** a header is inserted into a file whose first line starts with `#!`
- **THEN** the shebang remains line 1 and the SPDX header follows it

#### Scenario: Excluded files untouched
- **WHEN** the header script is pointed at a locale catalog, an HTML CV template, or a file under an excluded directory
- **THEN** the file's content is unchanged

### Requirement: Headers are maintained automatically at commit time
The pre-commit hook (`scripts/hooks/pre-commit`) SHALL run `scripts/add_license_headers.py` on staged added/copied/modified/renamed files of the covered suffixes and restage them, so a commit never introduces a headerless covered file. The header pass MUST be idempotent (a file already carrying an SPDX identifier in its first 5 lines is left unchanged) and MUST NOT block a commit (the script always exits 0).

#### Scenario: New file gets headered on commit
- **WHEN** a new `.py` file without an SPDX header is staged and committed
- **THEN** the committed file starts with the SPDX header

#### Scenario: Idempotent re-run
- **WHEN** the header script runs twice on the same file
- **THEN** the second run makes no change and prints nothing for that file
