# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Centralised path resolution — the single source of truth for where things live.

Splits two kinds of paths:

* **Read-only bundled resources** (CV templates, the built frontend). When frozen
  by PyInstaller these live under ``sys._MEIPASS``; in a source checkout they
  live at the repo root.
* **Writable user data** (config, profile, photo, jobs.db, generated CVs, the
  downloaded Chromium). In a packaged app the install location is read-only, so
  this goes to the OS's standard per-user data directory. In a normal source
  checkout it stays in the repo — identical to the pre-packaging behaviour, so
  development and the existing CLIs are unaffected.
"""

import os
import sys
from pathlib import Path

from platformdirs import user_data_dir

FROZEN = getattr(sys, "frozen", False)

# --- Read-only bundled resources ---------------------------------------------
if FROZEN:
    RESOURCE_DIR = Path(sys._MEIPASS)  # type: ignore[attr-defined]
else:
    RESOURCE_DIR = Path(__file__).resolve().parent.parent

TEMPLATES_DIR = RESOURCE_DIR / "templates" / "cv"
FRONTEND_DIST = RESOURCE_DIR / "frontend" / "dist"
# Source UI catalog (English) + shipped locales. Bundled as data in the packaged
# app so on-device translation (Phase D) can read the English strings to translate.
UI_LOCALES_SRC = RESOURCE_DIR / "frontend" / "src" / "locales"

# --- Writable user data ------------------------------------------------------
# Frozen: ~/Library/Application Support/MyJobCoach (mac), %APPDATA%\MyJobCoach (win).
# Source checkout: the repo root, so data stays exactly where it does today.
#
# MYJOBCOACH_DATA_DIR overrides both. It exists so a developer can run a genuine
# first launch — no config.json, no profile, no jobs.db, so onboarding and every
# empty state are the real ones — without moving their own data out of the repo.
# Read at import, so it must be set in the environment that starts the process.
_data_override = os.environ.get("MYJOBCOACH_DATA_DIR")
if _data_override:
    DATA_DIR = Path(_data_override).expanduser().resolve()
else:
    DATA_DIR = Path(user_data_dir("MyJobCoach", "MyJobCoach")) if FROZEN else RESOURCE_DIR
DATA_DIR.mkdir(parents=True, exist_ok=True)

CONFIG_PATH = DATA_DIR / "config.json"
PROFILE_DIR = DATA_DIR / "profile"
PROFILE_PATH = PROFILE_DIR / "profile.json"
PHOTO_DIR = PROFILE_DIR  # photo.{jpg,png,...} sits next to profile.json
DB_PATH = DATA_DIR / "jobs" / "jobs.db"
OUTPUT_DIR = DATA_DIR / "output"

# Downloaded local LLM models (GGUF) live in the writable data dir, like Chromium,
# so they survive a read-only install and are excluded from backups (multi-GB).
MODELS_DIR = DATA_DIR / "models"

# On-device generated UI locale files (Tier-2 languages) and generated CV labels.
LOCALES_DIR = DATA_DIR / "locales"

# Chromium that Playwright downloads on first run lives in the writable dir too,
# so it survives from a read-only install. Only the packaged launcher points
# PLAYWRIGHT_BROWSERS_PATH here; in dev the default Playwright cache is used.
BROWSERS_DIR = DATA_DIR / "ms-playwright"


def seed_data_dir() -> None:
    """First-run setup of the writable data dir: just the profile directory (the
    photo is written next to profile.json before any profile exists).

    The profile itself is deliberately NOT seeded — a new install must not open on
    a sample person's job history, languages and enabled sections presented as the
    user's own answers. With no file, GET /api/profile returns blank_profile() and
    the UI shows its import-or-fill empty state. config.json and jobs.db are
    created lazily by config.save() / db.init_db().
    """
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
