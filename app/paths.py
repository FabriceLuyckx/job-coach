"""Centralised path resolution — the single source of truth for where things live.

Splits two kinds of paths:

* **Read-only bundled resources** (CV templates, the built frontend, the sample
  profile). When frozen by PyInstaller these live under ``sys._MEIPASS``; in a
  source checkout they live at the repo root.
* **Writable user data** (config, profile, photo, jobs.db, generated CVs, the
  downloaded Chromium). In a packaged app the install location is read-only, so
  this goes to the OS's standard per-user data directory. In a normal source
  checkout it stays in the repo — identical to the pre-packaging behaviour, so
  development and the existing CLIs are unaffected.
"""

import shutil
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
EXAMPLE_PROFILE = RESOURCE_DIR / "profile" / "profile.example.json"

# --- Writable user data ------------------------------------------------------
# Frozen: ~/Library/Application Support/JobCoach (mac), %APPDATA%\JobCoach (win).
# Source checkout: the repo root, so data stays exactly where it does today.
DATA_DIR = Path(user_data_dir("JobCoach", "JobCoach")) if FROZEN else RESOURCE_DIR
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
    """First-run seeding: make sure the writable data dir has a profile to edit.

    Copies the bundled sample profile in if none exists yet. config.json and
    jobs.db are created lazily by config.save() / db.init_db(), so they need no
    seeding here. A no-op once the user has a profile.
    """
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    if not PROFILE_PATH.exists() and EXAMPLE_PROFILE.exists():
        shutil.copyfile(EXAMPLE_PROFILE, PROFILE_PATH)
