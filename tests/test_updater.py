# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""The decidable parts of the self-updater: version comparison, asset selection,
download-URL pinning, and every install-refusal precondition. The swap itself is
verified manually against real builds (see the change's design.md)."""

import shutil
import sys
from pathlib import Path

import pytest

from app import paths
from app.services import updater


# --- parse_version / is_newer -------------------------------------------------

@pytest.mark.parametrize("text,expected", [
    ("v1.2.3", (1, 2, 3)),
    ("1.2.3", (1, 2, 3)),
    ("v0.10.0", (0, 10, 0)),
    ("unknown", None),
    ("", None),
    ("v1.2", None),
    ("v1.2.3-rc1", None),
])
def test_parse_version(text, expected):
    assert updater.parse_version(text) == expected


@pytest.mark.parametrize("latest,current,newer", [
    ("v1.1.0", "1.0.0", True),
    ("v2.0.0", "1.9.9", True),
    ("v1.0.0", "1.0.0", False),   # equal — never a sidegrade
    ("v0.9.0", "1.0.0", False),   # older — never a downgrade
    ("v1.0.0", "unknown", False),  # unparseable current ⇒ no update
    ("garbage", "1.0.0", False),
])
def test_is_newer(latest, current, newer):
    assert updater.is_newer(latest, current) is newer


# --- asset_for_platform -------------------------------------------------------

_ASSETS = [
    {"name": "MyJobCoach-macos.dmg", "size": 1},
    {"name": "MyJobCoach-windows.zip", "size": 2},
]


@pytest.mark.parametrize("platform,name", [
    ("darwin", "MyJobCoach-macos.dmg"),
    ("win32", "MyJobCoach-windows.zip"),
])
def test_asset_for_platform(monkeypatch, platform, name):
    monkeypatch.setattr(sys, "platform", platform)
    asset = updater.asset_for_platform(_ASSETS)
    assert asset and asset["name"] == name


def test_asset_for_unsupported_platform(monkeypatch):
    monkeypatch.setattr(sys, "platform", "linux")
    assert updater.asset_for_platform(_ASSETS) is None


def test_asset_missing_from_release(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    assert updater.asset_for_platform([{"name": "MyJobCoach-windows.zip"}]) is None


# --- valid_download_url -------------------------------------------------------

def test_valid_download_url_accepts_project_releases():
    assert updater.valid_download_url(
        "https://github.com/FabriceLuyckx/job-coach/releases/download/v1.2.3/MyJobCoach-macos.dmg"
    )


@pytest.mark.parametrize("url", [
    "https://evil.example.com/FabriceLuyckx/job-coach/releases/download/v1.2.3/x.dmg",
    "http://github.com/FabriceLuyckx/job-coach/releases/download/v1.2.3/x.dmg",
    "https://github.com/SomeoneElse/job-coach/releases/download/v1.2.3/x.dmg",
    "https://github.com/FabriceLuyckx/job-coach/archive/main.zip",
    "",
])
def test_valid_download_url_rejects(url):
    assert not updater.valid_download_url(url)


# --- install_root / install_blocker -------------------------------------------

def test_blocker_source_checkout(monkeypatch):
    monkeypatch.setattr(paths, "FROZEN", False)
    assert updater.install_root() is None
    assert "git" in updater.install_blocker()


def test_install_root_macos_app_bundle(monkeypatch):
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(
        sys, "executable", "/Applications/MyJobCoach.app/Contents/MacOS/MyJobCoach"
    )
    assert str(updater.install_root()) == "/Applications/MyJobCoach.app"


def test_blocker_translocated_macos(monkeypatch):
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(
        sys,
        "executable",
        "/private/var/folders/ab/x/T/AppTranslocation/xyz/d/MyJobCoach.app/Contents/MacOS/MyJobCoach",
    )
    assert "Applications" in updater.install_blocker()


def test_blocker_running_from_dmg(monkeypatch):
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(
        sys, "executable", "/Volumes/MyJobCoach/MyJobCoach.app/Contents/MacOS/MyJobCoach"
    )
    assert "Applications" in updater.install_blocker()


def test_blocker_unwritable_parent(monkeypatch, tmp_path):
    apps = tmp_path / "Apps"
    exe = apps / "MyJobCoach.app" / "Contents" / "MacOS" / "MyJobCoach"
    exe.parent.mkdir(parents=True)
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "executable", str(exe))
    apps.chmod(0o555)
    try:
        assert "writable" in (updater.install_blocker() or "")
    finally:
        apps.chmod(0o755)


def test_no_blocker_for_writable_install(monkeypatch, tmp_path):
    exe = tmp_path / "MyJobCoach.app" / "Contents" / "MacOS" / "MyJobCoach"
    exe.parent.mkdir(parents=True)
    monkeypatch.setattr(paths, "FROZEN", True)
    monkeypatch.setattr(sys, "platform", "darwin")
    monkeypatch.setattr(sys, "executable", str(exe))
    assert updater.install_blocker() is None


# --- _stage (Windows zip layout) -----------------------------------------------

def test_stage_windows_unwraps_folder(monkeypatch, tmp_path):
    # release.yml zips the MyJobCoach folder itself (not just its contents), so
    # a fresh install and a self-update extract the same shape.
    src = tmp_path / "MyJobCoach"
    src.mkdir()
    (src / "MyJobCoach.exe").write_text("exe")
    archive = shutil.make_archive(str(tmp_path / "release"), "zip", root_dir=tmp_path, base_dir="MyJobCoach")

    monkeypatch.setattr(sys, "platform", "win32")
    monkeypatch.setattr(updater, "UPDATES_DIR", tmp_path / "updates")
    staged = updater._stage(Path(archive))
    assert (staged / "MyJobCoach.exe").exists()


# --- check_for_update ---------------------------------------------------------

def _release(tag="v99.0.0", assets=None):
    return {
        "tag_name": tag,
        "html_url": f"https://github.com/FabriceLuyckx/job-coach/releases/tag/{tag}",
        "assets": assets or [],
    }


def test_check_reports_not_installable_without_platform_asset(monkeypatch):
    # A real window: release-please tags the release before binaries upload.
    monkeypatch.setattr(updater, "_fetch_latest", lambda: _release(assets=[]))
    monkeypatch.setattr("app.api.system.app_version", lambda: "1.0.0")
    out = updater.check_for_update()
    assert out["available"] is True
    assert out["installable"] is False
    assert out["notes_url"]
    assert out["reason"]


def test_check_available_and_installable(monkeypatch):
    monkeypatch.setattr(sys, "platform", "darwin")
    asset = {
        "name": "MyJobCoach-macos.dmg",
        "size": 123,
        "browser_download_url": "https://github.com/FabriceLuyckx/job-coach/releases/download/v99.0.0/MyJobCoach-macos.dmg",
    }
    monkeypatch.setattr(updater, "_fetch_latest", lambda: _release(assets=[asset]))
    monkeypatch.setattr("app.api.system.app_version", lambda: "1.0.0")
    out = updater.check_for_update()
    assert out["available"] and out["installable"]
    assert out["latest"] == "99.0.0"


def test_check_unknown_version_means_no_update(monkeypatch):
    monkeypatch.setattr(updater, "_fetch_latest", lambda: _release())
    monkeypatch.setattr("app.api.system.app_version", lambda: "unknown")
    out = updater.check_for_update()
    assert out["available"] is False
    assert out["installable"] is False


def test_check_network_failure_is_a_readable_reason(monkeypatch):
    def boom():
        raise RuntimeError("no network")
    monkeypatch.setattr(updater, "_fetch_latest", boom)
    monkeypatch.setattr("app.api.system.app_version", lambda: "1.0.0")
    out = updater.check_for_update()
    assert out["available"] is False
    assert "no network" in out["reason"]
