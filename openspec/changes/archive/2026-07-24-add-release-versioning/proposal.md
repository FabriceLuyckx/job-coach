## Why

The app version lives once in `pyproject.toml` (`0.1.0`) and is bumped by hand;
releases are cut by pushing a `vX.Y.Z` tag manually, from wherever `HEAD` sits.
There is no release branch and no defined rule for what a version *means*. As the
app moves toward distributed desktop builds (Phase 7) and an About surface that
shows the version (and, next, a "Check for updates…" that compares against
releases), the version has to become **meaningful, automated, and cut from a
known-good branch** — not a number someone remembers to change.

This belongs to **Phase 7** (deployment / desktop packaging) and underpins
`add-about-modal`: that change *displays* the version; this one makes it real.

## What Changes

- Introduce a long-lived **`stable`** branch as the sole release/build source.
  `main` stays the development branch; releases are cut by merging `main` →
  `stable`, never built from `main`.
- Adopt **Conventional Commits** as the versioning signal. On merge to `stable`,
  a **release-please** GitHub Action reads the commits since the last release,
  computes the next **SemVer** bump (`feat:` → minor, `fix:`/`chore:` → patch,
  `feat!:` / `BREAKING CHANGE:` → major), and opens a release PR that bumps
  `pyproject.toml` and updates a `CHANGELOG.md`.
- Merging that release PR **tags `vX.Y.Z`** and creates the GitHub Release with
  generated notes. The existing tag-triggered `release.yml` build then attaches
  the macOS `.dmg` / Windows `.zip` binaries to that release.
- Document the branch model + commit convention (README / CLAUDE.md), and add a
  lightweight `commit-msg` hook that warns on non-conventional subjects so the
  automation isn't silently starved of a bump signal.
- `pyproject.toml` remains the **single source of truth** for the version — the
  same value `add-about-modal`'s `GET /api/version` already reads. Frontend
  `package.json` is not surfaced and is left out of the bump.

Not in scope: the "Check for updates…" action itself (a later change that reads
the latest release tag this flow guarantees), and code-signing/notarization.

## Capabilities

### New Capabilities
- `release-versioning`: Automated SemVer versioning driven by Conventional
  Commits, a `stable` release branch as the build source, and the CI wiring that
  bumps `pyproject.toml`, tags releases, and hands off to the existing binary
  build. The single source of truth for "what version is this".

### Modified Capabilities
<!-- None: no existing spec's requirements change. add-about-modal's version
     endpoint reads pyproject.toml unchanged. -->

## Impact

- **CI**: new `.github/workflows/release-please.yml` (runs on push to `stable`);
  `release.yml` stays tag-triggered but now attaches binaries to the
  release-please-created release for that tag (`action-gh-release` upserts).
- **Repo**: new protected `stable` branch; new `CHANGELOG.md`; a `commit-msg`
  hook under `scripts/hooks/`.
- **Config**: `release-please-config.json` + `.release-please-manifest.json`
  (release-type `python`, targeting `pyproject.toml`).
- **Docs**: README + CLAUDE.md gain the branch/commit/versioning model.
- No new runtime dependency, no data-model change, no app-code change (the
  version endpoint already reads `pyproject.toml`).
