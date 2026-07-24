# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Health and first-run setup endpoints.

PDF export and JS-heavy job scans need Chromium, which the packaged app downloads
once on first launch (it isn't bundled, to keep the installer small). This module
tracks that download so the frontend can show a one-time "setting up" banner and
gate PDF export until it's ready.
"""

import os
import subprocess
import sys
import threading
import tomllib
from importlib.metadata import PackageNotFoundError, version as _pkg_version
from pathlib import Path

from fastapi import APIRouter

from app import paths

router = APIRouter(prefix="/api", tags=["system"])


def app_version() -> str:
    """Running app version: installed package metadata → pyproject.toml → unknown."""
    try:
        return _pkg_version("myjobcoach")
    except PackageNotFoundError:
        pass
    try:
        pyproject = Path(__file__).resolve().parents[2] / "pyproject.toml"
        return tomllib.loads(pyproject.read_text())["project"]["version"]
    except Exception:
        # ponytail: "unknown" only in a frozen app with no metadata and no
        # pyproject; Phase 7 packaging can inject the version at build time.
        return "unknown"

_setup = {"chromium_ready": False, "installing": False, "error": None}
_lock = threading.Lock()


def _browsers_base() -> Path:
    return Path(os.environ.get("PLAYWRIGHT_BROWSERS_PATH") or paths.BROWSERS_DIR)


def chromium_ready() -> bool:
    """True once Playwright's Chromium is installed and its binary exists."""
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            return Path(p.chromium.executable_path).exists()
    except Exception:
        # Fallback: a chromium-* folder under the browsers dir is a good signal.
        base = _browsers_base()
        return base.exists() and any(base.glob("chromium-*"))


def _run_install() -> None:
    """Download Chromium via Playwright's own driver.

    Uses the bundled node driver directly so it also works inside a frozen app,
    where ``sys.executable`` is the app binary rather than a Python interpreter.
    Falls back to ``python -m playwright`` for a normal source checkout.
    """
    try:
        from playwright._impl._driver import compute_driver_executable

        driver = compute_driver_executable()
        cmd = list(driver) if isinstance(driver, (list, tuple)) else [driver]
        subprocess.run([*cmd, "install", "chromium"], check=True, env=os.environ.copy())
    except Exception:
        subprocess.run(
            [sys.executable, "-m", "playwright", "install", "chromium"],
            check=True,
            env=os.environ.copy(),
        )


def _install_worker() -> None:
    try:
        _run_install()
        with _lock:
            _setup["chromium_ready"] = True
            _setup["error"] = None
    except Exception as e:  # noqa: BLE001 — surface any failure to the UI
        with _lock:
            _setup["error"] = str(e)
    finally:
        with _lock:
            _setup["installing"] = False


def ensure_chromium() -> None:
    """Kick off a one-time Chromium download in the background if it's missing.

    Called from the packaged launcher on startup. Safe to call more than once.
    """
    with _lock:
        if _setup["chromium_ready"] or _setup["installing"]:
            return
        if chromium_ready():
            _setup["chromium_ready"] = True
            return
        _setup["installing"] = True
    threading.Thread(target=_install_worker, daemon=True).start()


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/version")
def version():
    return {"version": app_version()}


@router.get("/setup/status")
def setup_status():
    with _lock:
        if not _setup["chromium_ready"] and not _setup["installing"] and chromium_ready():
            _setup["chromium_ready"] = True
        return dict(_setup)
