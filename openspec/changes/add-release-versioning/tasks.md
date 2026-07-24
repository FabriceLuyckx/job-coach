## 1. Release automation config

- [x] 1.1 Add `release-please-config.json` at the repo root: `release-type: python`, package root `.`, changelog on. This makes `pyproject.toml` the bumped file.
- [x] 1.2 Add `.release-please-manifest.json` seeding the current version (`{".": "0.1.0"}`) so the first computed release continues the series.

## 2. CI workflows

- [x] 2.1 Add `.github/workflows/release-please.yml` triggered on `push` to `stable`, running `googleapis/release-please-action` with `contents: write` + `pull-requests: write`. It opens/updates the release PR and, on merge, tags `vX.Y.Z` + creates the GitHub Release with notes.
- [x] 2.2 Confirm `release.yml` still owns binaries only: it stays tag-triggered (`v*`) and its `action-gh-release` step attaches `.dmg`/`.zip` to the existing release for that tag (upsert, no duplicate). Add a one-line comment noting release-please owns the tag/release; `release.yml` only attaches artifacts.

## 3. Commit-convention guidance

- [x] 3.1 Add a `commit-msg` hook under `scripts/hooks/` that warns (exit 0, never blocks) when the subject isn't a Conventional Commit (`type(scope)?!: subject`). It sits alongside the existing `pre-commit` hook under the already-configured `core.hooksPath`.
- [x] 3.2 Add one runnable self-check for the hook's matcher (e.g. `tests/test_commit_msg_hook.py` asserting `feat: x` / `fix!: y` pass and `random subject` warns) — non-trivial parsing logic, so it leaves one check behind.

## 4. Docs

- [x] 4.1 Update `README.md`: document the branch model (`main` = dev, `stable` = release/build source), the Conventional Commit convention, and that versions are computed automatically on merge to `stable`.
- [x] 4.2 Update `CLAUDE.md`: note the `stable` release branch, the release-please + `release.yml` handoff, and the commit convention under the Phase 7 / Development Rules area; cross-reference `add-about-modal`'s `GET /api/version` as the runtime reader of the bumped version.

## 5. Rollout

- [x] 5.1 The one-time GitHub steps — create the protected `stable` branch and the first release dry-run — are human/GitHub-UI actions documented in `design.md`'s Migration Plan; they are intentionally not agent-checkbox tasks.
