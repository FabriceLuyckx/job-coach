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
    assert opened == [f"http://{desktop.HOST}:{desktop.PREFERRED_PORT}"]


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
