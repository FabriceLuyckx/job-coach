#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

#
# One-command dev setup for MyJobCoach (macOS).
#
# Installs everything a fresh clone needs: Homebrew, uv, Node, all backend and
# frontend dependencies, the headless browser for PDF export, and seeds the
# local profile/config from the committed *.example files.
#
# Usage:  ./setup.sh
#
# Note: macOS only for now. Linux/Windows are not handled yet.

set -euo pipefail

cd "$(dirname "$0")"

say()  { printf '\n\033[1;34m==>\033[0m %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

if [[ "$(uname)" != "Darwin" ]]; then
  echo "This script currently supports macOS only. See README.md for manual steps." >&2
  exit 1
fi

# 1. Homebrew
if ! have brew; then
  say "Installing Homebrew..."
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  # Make brew available in this shell (Apple Silicon vs Intel paths)
  if [[ -x /opt/homebrew/bin/brew ]]; then eval "$(/opt/homebrew/bin/brew shellenv)"; fi
  if [[ -x /usr/local/bin/brew   ]]; then eval "$(/usr/local/bin/brew shellenv)";   fi
else
  say "Homebrew found: $(brew --version | head -1)"
fi

# 2. uv (Python package manager — also installs the right Python)
if ! have uv; then
  say "Installing uv..."
  brew install uv
else
  say "uv found: $(uv --version)"
fi

# 3. Node.js (for the frontend dev server)
if ! have node; then
  say "Installing Node.js..."
  brew install node
else
  say "Node found: $(node --version)"
fi

# 4. Backend dependencies (creates .venv, installs from uv.lock)
say "Installing backend dependencies (uv sync)..."
uv sync

# 5. Headless browser for server-side PDF export
say "Installing Chromium for PDF export (playwright)..."
uv run playwright install chromium

# 6. Frontend dependencies
say "Installing frontend dependencies (npm install)..."
( cd frontend && npm install )

# 7. Seed local config from the example (never clobber an existing file).
# The profile is intentionally NOT seeded: the app starts with a blank profile so
# you fill in your own details (or import an existing CV) rather than editing a
# sample person's data. profile.example.json is kept only as a schema reference.
if [[ ! -f config.json ]]; then
  say "Seeding config.json from config.json.example"
  cp config.json.example config.json
fi

# 8. Git pre-commit hook: auto-translate new/updated UI strings on commit.
say "Enabling the translation pre-commit hook (git hooksPath)..."
git config core.hooksPath scripts/hooks

cat <<'DONE'

==> Setup complete! Next steps:

  Terminal 1 (backend):   uv run uvicorn app.main:app --reload
  Terminal 2 (frontend):  cd frontend && npm run dev

  Then open http://localhost:5173

  Add your OpenRouter API key on the Settings page to enable the AI features.
  Then fill in your Profile — or import an existing CV (PDF or paste) to start.
DONE
