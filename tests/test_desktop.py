# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""The launcher's fallback selection: with no webview backend available, the
browser path is taken and the server is still started. The window itself is
verified manually against real builds (see the change's design.md)."""

import sys
import threading

from app import desktop


def test_no_webview_falls_back_to_browser_and_server_runs(monkeypatch):
    server_started = threading.Event()
    opened = []

    # No webview backend importable.
    monkeypatch.setitem(sys.modules, "webview", None)
    # Server "starts" without actually binding a port.
    import uvicorn

    monkeypatch.setattr(uvicorn, "run", lambda *a, **k: server_started.set())
    from app.api import system

    monkeypatch.setattr(system, "ensure_chromium", lambda: None)
    # Not already running; readiness answers immediately.
    monkeypatch.setattr(desktop, "_port_in_use", lambda port: False)
    monkeypatch.setattr(desktop, "_is_our_app", lambda port: True)
    monkeypatch.setattr(desktop, "_serve_forever", lambda: None)  # don't block the test
    monkeypatch.setattr(desktop.webbrowser, "open", lambda url: opened.append(url))

    desktop.main()

    assert server_started.wait(timeout=5), "uvicorn was never started"
    # Version-stamped: a fresh cache key per release (see desktop.main).
    assert opened == [f"http://{desktop.HOST}:{desktop.PREFERRED_PORT}/?v={system.app_version()}"]


def test_wait_ready_polls_until_the_server_answers(monkeypatch):
    """A slow cold start must be waited out, not given up on. The old version
    capped at ~10s and discarded the result, so a slow laptop opened the UI
    against a port nothing was listening on yet (ERR_CONNECTION_REFUSED next to
    a console claiming the app was running)."""
    calls = []

    def answers_on_the_fifth_try(port):
        calls.append(port)
        return len(calls) >= 5

    monkeypatch.setattr(desktop, "_is_our_app", answers_on_the_fifth_try)
    assert desktop._wait_ready(1234, timeout=5) is True
    assert len(calls) == 5


def test_wait_ready_reports_failure_instead_of_returning_none(monkeypatch):
    monkeypatch.setattr(desktop, "_is_our_app", lambda port: False)
    assert desktop._wait_ready(1234, timeout=0.5) is False


def test_windowed_build_gets_real_stdio_so_uvicorn_can_configure_logging(monkeypatch):
    """PyInstaller's console=False leaves sys.stdout/stderr as None on Windows.
    uvicorn's ColourizedFormatter calls sys.stdout.isatty() while configuring
    logging, so uvicorn.run() died before binding and the server thread went
    down silently — the app printed "running" at a port nothing listened on."""
    import uvicorn.logging

    monkeypatch.setattr(sys, "stdout", None)
    monkeypatch.setattr(sys, "stderr", None)

    desktop._redirect_stdio()

    assert sys.stdout is not None and sys.stderr is not None
    uvicorn.logging.DefaultFormatter()  # raised AttributeError before the fix
    uvicorn.logging.AccessFormatter()


def test_startup_failure_is_reported_instead_of_claiming_success(monkeypatch, capsys):
    monkeypatch.setattr(desktop, "_serve_forever", lambda: None)
    monkeypatch.setattr(desktop.webbrowser, "open", lambda url: None)

    desktop._browser_fallback("http://127.0.0.1:8756", ready=False)

    out = capsys.readouterr().out
    assert "failed to start" in out and str(desktop.LOG_PATH) in out


def test_second_launch_opens_browser_without_second_server(monkeypatch):
    opened = []
    monkeypatch.setattr(desktop, "_port_in_use", lambda port: True)
    monkeypatch.setattr(desktop, "_is_our_app", lambda port: True)
    monkeypatch.setattr(desktop.webbrowser, "open", lambda url: opened.append(url))

    started = []
    monkeypatch.setattr(desktop.threading, "Thread",
                        lambda *a, **k: started.append(1) or threading.Thread(target=lambda: None))

    desktop.main()

    assert opened == [f"http://{desktop.HOST}:{desktop.PREFERRED_PORT}"]
    assert not started  # no server thread was created


def test_desktop_entry_written_with_current_exec_and_icon(monkeypatch, tmp_path):
    """The Linux .desktop entry must point Exec at the running binary and Icon
    at a copied file — a stale Exec after the user moves the install is why it
    is rewritten every launch."""
    monkeypatch.setenv("XDG_DATA_HOME", str(tmp_path))

    desktop._install_desktop_entry()

    icon = tmp_path / "icons" / "MyJobCoach.png"
    entry = (tmp_path / "applications" / "MyJobCoach.desktop").read_text()
    assert icon.is_file()
    assert f'Exec="{sys.executable}"' in entry
    assert f"Icon={icon}" in entry
    assert "StartupWMClass=MyJobCoach" in entry
