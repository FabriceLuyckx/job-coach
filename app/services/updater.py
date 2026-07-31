# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Self-updater for the packaged desktop app.

Checks the project's GitHub Releases for a newer version, and — on explicit
user approval — downloads the platform asset, stages it, and swaps it over the
running install via a detached helper script that waits for the app to exit,
then relaunches. The current install is moved aside, never deleted, until the
replacement is verified in place. See openspec/changes/add-app-updater/design.md.
"""

import os
import platform
import re
import shutil
import subprocess
import sys
import threading
from pathlib import Path

import httpx

from app import paths

REPO = "FabriceLuyckx/job-coach"
LATEST_URL = f"https://api.github.com/repos/{REPO}/releases/latest"
# The updater downloads and then *executes* what it fetches, so the download URL
# is never followed on trust from release JSON: it must start with this prefix.
DOWNLOAD_PREFIX = f"https://github.com/{REPO}/releases/download/"
# Stable per-platform asset names (the release-versioning naming contract).
# macOS ships two builds; the plain name stays **arm64** so apps already installed
# on Apple Silicon keep matching it, and Intel gets the suffixed one. An x86_64
# build running under Rosetta reports x86_64 and so correctly stays on Intel.
ASSET_NAMES = {
    "darwin": "MyJobCoach-macos.dmg",
    "win32": "MyJobCoach-windows.zip",
    "linux": "MyJobCoach-linux.tar.gz",
}
MACOS_INTEL_ASSET = "MyJobCoach-macos-intel.dmg"
_UA = "MyJobCoach-updater"

UPDATES_DIR = paths.DATA_DIR / "updates"

_VERSION_RE = re.compile(r"^v?(\d+)\.(\d+)\.(\d+)$")


def parse_version(text: str) -> tuple[int, int, int] | None:
    """'v1.2.3' or '1.2.3' → (1, 2, 3); None for 'unknown' or anything else."""
    m = _VERSION_RE.match((text or "").strip())
    return (int(m[1]), int(m[2]), int(m[3])) if m else None


def is_newer(latest: str, current: str) -> bool:
    """Strict >: never offer a sidegrade or downgrade; unparseable ⇒ False."""
    lv, cv = parse_version(latest), parse_version(current)
    return lv is not None and cv is not None and lv > cv


def asset_name() -> str | None:
    """Stable asset name for this platform+architecture, or None if unsupported."""
    if sys.platform == "darwin" and platform.machine() == "x86_64":
        return MACOS_INTEL_ASSET
    return ASSET_NAMES.get(sys.platform)


def asset_for_platform(assets: list[dict]) -> dict | None:
    """The release asset for this platform, selected by its stable name."""
    wanted = asset_name()
    if not wanted:
        return None
    return next((a for a in assets if a.get("name") == wanted), None)


def valid_download_url(url: str) -> bool:
    return url.startswith(DOWNLOAD_PREFIX)


def _fetch_latest() -> dict:
    r = httpx.get(
        LATEST_URL,
        headers={"User-Agent": _UA, "Accept": "application/vnd.github+json"},
        timeout=10,
        follow_redirects=True,
    )
    r.raise_for_status()
    return r.json()


def check_for_update() -> dict:
    """Compare the latest published release against the running version.

    Never raises: network/HTTP failures come back as a readable `reason`, and an
    unparseable version on either side means "no update" rather than a guess.
    """
    from app.api.system import app_version  # lazy — system.py imports this module

    current = app_version()
    out = {
        "available": False,
        "current": current,
        "latest": None,
        "notes_url": None,
        "installable": False,
        "reason": None,
    }
    try:
        rel = _fetch_latest()
    except Exception as e:  # noqa: BLE001 — the reason is shown to the user
        out["reason"] = f"Could not reach the release server: {e}"
        return out
    tag = rel.get("tag_name") or ""
    out["latest"] = tag.lstrip("v") or None
    out["notes_url"] = rel.get("html_url")
    if not is_newer(tag, current):
        return out
    out["available"] = True
    asset = asset_for_platform(rel.get("assets") or [])
    if asset is None:
        # Real window: release-please tags the release, binaries upload minutes
        # later. Available-but-not-installable, never an error.
        out["reason"] = "The installer for this release is still being built — check back in a few minutes."
        return out
    if not valid_download_url(asset.get("browser_download_url") or ""):
        out["reason"] = "The release asset is not hosted on the project's own releases."
        return out
    out["installable"] = True
    return out


# --- Install preconditions ----------------------------------------------------

def install_root() -> Path | None:
    """The directory the updater would replace: the .app bundle on macOS, the
    onedir folder on Windows. None when not a packaged install."""
    if not paths.FROZEN:
        return None
    exe = Path(sys.executable)
    if sys.platform == "darwin":
        return next((p for p in exe.parents if p.suffix == ".app"), None)
    if sys.platform in ("win32", "linux"):
        return exe.parent
    return None


def install_blocker() -> str | None:
    """Why self-update must be refused, or None when it can proceed."""
    if not paths.FROZEN:
        return "This is a source checkout — update it with git instead."
    root = install_root()
    if root is None:
        return "Couldn't locate the installed application bundle."
    s = str(root)
    if sys.platform == "darwin" and ("/AppTranslocation/" in s or s.startswith("/Volumes/")):
        return (
            "The app is running from the disk image or a translocated copy — "
            "move MyJobCoach to Applications first, then try again."
        )
    if not os.access(root.parent, os.W_OK):
        return f"The folder containing the app ({root.parent}) isn't writable."
    return None


# --- Download / stage / swap --------------------------------------------------
# One update in flight at a time, ever — a single module-level dict, no id keying.

_state = {"state": "idle", "bytes_done": 0, "bytes_total": 0, "error": None}
_state_lock = threading.Lock()
_cancel = threading.Event()

_IN_FLIGHT = ("downloading", "staging", "restarting")


class _Cancelled(Exception):
    pass


def status() -> dict:
    with _state_lock:
        return dict(_state)


def _set(**kw) -> None:
    with _state_lock:
        _state.update(kw)


def cancel() -> None:
    """Stop the in-flight download; the installation is left untouched."""
    _cancel.set()


def start_install() -> bool:
    """Kick off the download/stage/swap thread. False when one is already running.

    Callers must check install_blocker() first — a refusal costs no bytes.
    """
    with _state_lock:
        if _state["state"] in _IN_FLIGHT:
            return False
        _state.update(state="downloading", bytes_done=0, bytes_total=0, error=None)
    _cancel.clear()
    threading.Thread(target=_install_worker, daemon=True).start()
    return True


def _cleanup() -> None:
    shutil.rmtree(UPDATES_DIR, ignore_errors=True)


def _install_worker() -> None:
    try:
        _cleanup()
        rel = _fetch_latest()
        asset = asset_for_platform(rel.get("assets") or [])
        if asset is None:
            raise RuntimeError("This release has no download for this platform.")
        url = asset.get("browser_download_url") or ""
        if not valid_download_url(url):
            raise RuntimeError("The release asset is not hosted on the project's own releases.")
        archive = _download(url, int(asset.get("size") or 0), asset["name"])
        _set(state="staging")
        staged = _stage(archive)
        _launch_swap(staged)
    except _Cancelled:
        _cleanup()
        _set(state="cancelled", error=None)
    except Exception as e:  # noqa: BLE001 — surfaced verbatim in the UI
        _cleanup()
        _set(state="error", error=str(e))


def _download(url: str, declared_size: int, name: str) -> Path:
    UPDATES_DIR.mkdir(parents=True, exist_ok=True)
    dest = UPDATES_DIR / name
    done = 0
    with httpx.stream(
        "GET", url, headers={"User-Agent": _UA}, timeout=30, follow_redirects=True
    ) as r:
        r.raise_for_status()
        _set(bytes_total=int(r.headers.get("Content-Length") or declared_size or 0))
        with open(dest, "wb") as f:
            for chunk in r.iter_bytes(1 << 20):
                if _cancel.is_set():
                    raise _Cancelled()
                f.write(chunk)
                done += len(chunk)
                _set(bytes_done=done)
    # A truncated stream that ended without an error must not become an app.
    if declared_size and dest.stat().st_size != declared_size:
        raise RuntimeError("The download is incomplete (size mismatch) — update abandoned.")
    return dest


def _stage(archive: Path) -> Path:
    """Unpack the downloaded archive into DATA_DIR/updates/staged/ and return the
    path the swap helper should copy from."""
    staged = UPDATES_DIR / "staged"
    staged.mkdir(parents=True, exist_ok=True)
    if sys.platform == "darwin":
        mnt = UPDATES_DIR / "mnt"
        subprocess.run(
            ["hdiutil", "attach", "-nobrowse", "-readonly", "-mountpoint", str(mnt), str(archive)],
            check=True, capture_output=True,
        )
        try:
            apps = sorted(mnt.glob("*.app"))
            if not apps:
                raise RuntimeError("No .app bundle found in the downloaded image.")
            target = staged / apps[0].name
            subprocess.run(["ditto", str(apps[0]), str(target)], check=True, capture_output=True)
        finally:
            subprocess.run(["hdiutil", "detach", str(mnt)], capture_output=True)
        if not (target / "Contents" / "MacOS").is_dir():
            raise RuntimeError("The staged app bundle is incomplete — update abandoned.")
        return target
    # Windows/Linux: the archive wraps a single "MyJobCoach" folder (matches
    # what a user extracting the release manually gets — see release.yml).
    # is_file(), not exists(): on Linux the binary and the wrapper folder are
    # both named "MyJobCoach", so exists() would match the directory.
    exe = "MyJobCoach.exe" if sys.platform == "win32" else "MyJobCoach"
    shutil.unpack_archive(str(archive), str(staged))
    if (staged / exe).is_file():
        return staged
    wrapped = staged / "MyJobCoach"
    if (wrapped / exe).is_file():
        return wrapped
    raise RuntimeError(f"The staged update is missing {exe} — update abandoned.")


def _launch_swap(staged: Path) -> None:
    """Write the platform swap helper, launch it detached, and exit the app.

    The helper waits for this PID, moves the install aside (never deletes it
    first), copies the staged bundle in, restores on failure, and relaunches.
    It lives in DATA_DIR, never inside the directory it is replacing.
    """
    root = install_root()
    pid = os.getpid()
    if sys.platform != "win32":
        if sys.platform == "darwin":
            copy = f'ditto "{staged}" "{root}"'
            finish = f'xattr -dr com.apple.quarantine "{root}" 2>/dev/null\nopen "{root}"'
        else:  # linux
            copy = f'cp -a "{staged}" "{root}"'
            finish = f'"{root}/MyJobCoach" >/dev/null 2>&1 &'
        script = UPDATES_DIR / "swap.sh"
        script.write_text(f"""#!/bin/sh
while kill -0 {pid} 2>/dev/null; do sleep 0.5; done
mv "{root}" "{root}.old" || exit 1
if {copy}; then
  rm -rf "{root}.old"
else
  rm -rf "{root}"
  mv "{root}.old" "{root}"
fi
{finish}
""")
        script.chmod(0o755)
        subprocess.Popen(
            ["/bin/sh", str(script)],
            start_new_session=True,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    else:
        script = UPDATES_DIR / "swap.cmd"
        script.write_text(f"""@echo off
:wait
tasklist /FI "PID eq {pid}" 2>nul | find "{pid}" >nul && (timeout /t 1 /nobreak >nul & goto wait)
move "{root}" "{root}.old" || exit /b 1
xcopy "{staged}" "{root}" /E /I /Q /Y
if errorlevel 1 (
  rmdir /s /q "{root}"
  move "{root}.old" "{root}"
) else (
  rmdir /s /q "{root}.old"
)
start "" "{root}\\MyJobCoach.exe"
""")
        flags = subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP
        subprocess.Popen(
            ["cmd", "/c", str(script)],
            creationflags=flags,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
    _set(state="restarting")
    # Exit after the HTTP response flushes. uvicorn graceful shutdown buys
    # nothing for a process about to be overwritten; SQLite commits per request.
    threading.Timer(1.5, lambda: os._exit(0)).start()
