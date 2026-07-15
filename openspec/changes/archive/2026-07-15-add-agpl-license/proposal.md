## Why

The project has no license, so by default all rights are reserved and nobody can legally use, modify, or self-host it. The owner wants the source protected under GNU AGPLv3 — including per-file license notices — before wider sharing (repo is already linked publicly from the app footer).

## What Changes

- Add the verbatim GNU AGPLv3 text as `LICENSE` at the repo root.
- Declare `AGPL-3.0-or-later` in `pyproject.toml` and `frontend/package.json`.
- Add a 2-line SPDX header (`SPDX-License-Identifier` + copyright) to every tracked `.py`/`.ts`/`.tsx`/`.sh` source file via a new stdlib-only script `scripts/add_license_headers.py`; one-time backfill across the tree.
- Extend the **existing** pre-commit hook (`scripts/hooks/pre-commit`) to run the header script on staged source files and restage them, so new files stay compliant automatically. No new hook file, no hook framework.
- Add a License section to `README.md`.
- Explicitly excluded from headers: JSON (incl. locale catalogs), HTML (Jinja CV templates render into user-facing CVs), CSS, Markdown, config files, and generated/vendored dirs (`output/`, `models/`, `node_modules/`, `frontend/dist/`).

Not a breaking change for any app behavior; commits gain an automatic header pass.

The detailed plan (header format, script behavior, hook snippet, verification steps) already exists in `docs/plans/agpl-license.md` and is the source for design.md.

## Capabilities

### New Capabilities
- `license-compliance`: the repo carries the AGPLv3 license text, package metadata declares the license, and every source file of a covered type has an SPDX header — kept true automatically at commit time.

### Modified Capabilities

(none — no existing spec's requirements change)

## Impact

- New files: `LICENSE`, `scripts/add_license_headers.py`.
- Modified: `scripts/hooks/pre-commit`, `pyproject.toml`, `frontend/package.json`, `README.md`, plus a 2-line header prepended to every tracked `.py`/`.ts`/`.tsx`/`.sh` file (large but mechanical diff).
- No runtime, API, or dependency changes. AGPL §13 (network-use source offer) is already satisfied by the app footer's repo link — constraint: don't remove that footer.
- Phase: standalone housekeeping change, not tied to a CLAUDE.md phase (closest is Phase 7 cloud-deployment readiness).
