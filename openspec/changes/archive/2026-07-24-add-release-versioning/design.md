## Context

The version sits once in `pyproject.toml` (`0.1.0`), bumped by hand. Releases are
cut by manually pushing a `vX.Y.Z` tag; `.github/workflows/release.yml` reacts to
`push: tags: ["v*"]`, builds the PyInstaller macOS `.dmg` + Windows `.zip`, and
publishes a GitHub Release via `softprops/action-gh-release`. There is no release
branch — a tag can be cut from any commit. `add-about-modal` adds
`GET /api/version` that reads `pyproject.toml` metadata, so whatever lives there
becomes the user-visible version. The user wants releases built from a dedicated
`stable` branch and the version decided automatically at merge time, not by hand.

## Goals / Non-Goals

**Goals:**
- A `stable` branch that is the only build source; `main` stays development.
- Version bump level derived automatically from Conventional Commits (SemVer).
- One version source of truth (`pyproject.toml`) that the app already reads.
- Reuse the existing `release.yml` binary build unchanged in spirit.

**Non-Goals:**
- The "Check for updates…" action (later change; it will read the latest tag).
- Code-signing / notarization (already deferred in `release.yml`).
- Bumping or surfacing the frontend `package.json` version.

## Decisions

- **Tool = `googleapis/release-please-action`, not a hand-rolled bumper.**
  release-please reads Conventional Commits, computes the SemVer bump, maintains a
  rolling "release PR" that updates `pyproject.toml` + `CHANGELOG.md`, and on merge
  tags `vX.Y.Z` and creates the GitHub Release with notes. Alternatives:
  *python-semantic-release* (also fine, but pushes commits/tags directly with no
  review gate — the release PR is desirable when the build ships executables to
  users); *a custom `git log` → SemVer script* (rejected: parsing conventional
  commits and computing prerelease/edge cases is exactly what the maintained action
  does — ponytail rung "maintained action over owning fragile version math").
  `release-type: python` targets `pyproject.toml`, keeping the single source of
  truth.
- **`stable` is where release-please runs.** `release-please.yml` triggers on
  `push` to `stable`. Merging `main` → `stable` is the human "cut a release" act;
  release-please then proposes the version from the commits that arrived. `stable`
  is branch-protected (updated only via merge from `main` or the release PR).
- **Two workflows, clean handoff.** `release-please.yml` owns *versioning* (bump,
  tag, release + notes). The existing `release.yml` stays *tag-triggered* and owns
  *binaries*: on the `vX.Y.Z` tag release-please creates, it builds and attaches the
  `.dmg`/`.zip`. `action-gh-release` upserts onto the existing release for that tag,
  so no duplicate release. Keeps the build logic untouched and the two concerns
  separable.
- **Config files.** `release-please-config.json` (`release-type: python`, package
  root `.`) + `.release-please-manifest.json` (seeds the current version, `0.1.0`).
  Standard, declarative, no code.
- **Commit convention is guided, not enforced hard.** A `commit-msg` hook under
  the existing `scripts/hooks/` (already `core.hooksPath`) warns when a subject
  isn't a Conventional Commit, and exits 0 (never blocks). release-please already
  degrades gracefully on non-conventional commits (no bump / "Other" section); the
  hook just keeps the signal healthy without becoming a gate.

## Risks / Trade-offs

- **Two workflows must agree on the tag** → `release.yml` already keys on `v*`
  tags and release-please creates exactly that format; nothing to coordinate beyond
  the shared `vX.Y.Z` convention. If `release.yml` runs before the release object
  is fully created, `action-gh-release` still upserts on the tag.
- **Commit discipline drives correctness** → a stream of non-conventional commits
  yields no bump. Mitigation: the warning hook + documented convention in
  CLAUDE.md/README. Ponytail: guidance over a hard gate; upgrade to a blocking
  `commitlint` only if versions actually go stale.
- **Frozen desktop build version resolution** → in a PyInstaller bundle
  `importlib.metadata`/`pyproject.toml` may be absent, so `app_version()` (from
  `add-about-modal`) can fall back to `"unknown"`. Out of scope here; the Phase 7
  packaging step can bake the `pyproject` version into the bundle. Cross-referenced,
  not solved in this change.
- **Existing tags/state** → `.release-please-manifest.json` is seeded to the
  current `0.1.0` so the first computed release continues the series rather than
  restarting.

## Migration Plan

1. Create the protected `stable` branch from the current `main`.
2. Add `release-please-config.json`, `.release-please-manifest.json` (seed `0.1.0`),
   and `.github/workflows/release-please.yml` (trigger: push to `stable`).
3. Add the `commit-msg` hook + document the branch/commit/version model.
4. First release: merge `main` → `stable`; merge the release PR release-please
   opens; confirm the `vX.Y.Z` tag, GitHub Release, and attached binaries.
- **Rollback**: delete `release-please.yml` and the config files; releases revert
  to manual tag pushes (`release.yml` is unchanged and keeps working).

## Open Questions

- Should `stable` require a PR (vs. a fast-forward push) for the `main` → `stable`
  merge? Defaulting to PR for the review gate; not load-bearing for the automation.
