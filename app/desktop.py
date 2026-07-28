# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Desktop launcher — the packaged app's entry point.

Starts the FastAPI app on a local port in a background thread, then hosts the
UI in a native application window (WKWebView on macOS, WebView2 on Windows,
via pywebview) so the running app has its own Dock/taskbar icon and closing
the window quits it. The GUI event loop must own the main thread — that is why
the *server* is the one in a thread: ``webview.start()`` blocks until the last
window closes, and when it returns, ``main()`` ends and the daemon server
thread dies with the process. Closing the window *is* the quit path.

If no web view backend is available (e.g. a missing WebView2 runtime), the
launcher falls back to the old behaviour: open the user's default browser at
the local address and keep the process alive until the user kills it.
"""

import os
import socket
import sys
import threading
import time
import webbrowser
from urllib.request import urlopen

from app import paths

HOST = "127.0.0.1"
PREFERRED_PORT = 8756
WINDOW_TITLE = "MyJobCoach"


def _port_in_use(port: int) -> bool:
    with socket.socket() as s:
        return s.connect_ex((HOST, port)) == 0


def _pick_port() -> int:
    if not _port_in_use(PREFERRED_PORT):
        return PREFERRED_PORT
    with socket.socket() as s:  # preferred port busy — ask the OS for a free one
        s.bind((HOST, 0))
        return s.getsockname()[1]


def _is_our_app(port: int) -> bool:
    try:
        with urlopen(f"http://{HOST}:{port}/api/health", timeout=1) as r:
            return r.status == 200
    except Exception:
        return False


def _wait_ready(port: int, timeout: float = 90.0) -> bool:
    """Block until the server answers. True if it did, False on timeout.

    The budget is generous on purpose: a cold first launch on a slow 2-core
    laptop spends most of a minute unpacking the onedir bundle and importing
    fastapi/llama_cpp/playwright before uvicorn ever binds. The old 10s gave
    up silently and the caller opened the UI anyway, so the user got a console
    claiming "running at http://..." next to a browser saying
    ERR_CONNECTION_REFUSED — a working app that looks broken.
    """
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _is_our_app(port):
            return True
        time.sleep(0.2)
    return False


def _serve_forever() -> None:
    threading.Event().wait()


def _browser_fallback(url: str) -> None:
    """No usable web view — today's pre-window behaviour: browser + a console."""
    if sys.platform == "win32":
        # ponytail: console=False removed the quit window; restore it only on
        # this path, the one that still needs "close this window to quit".
        import ctypes

        ctypes.windll.kernel32.AllocConsole()
        sys.stdout = sys.stderr = open("CONOUT$", "w")
    print(f"MyJobCoach is running at {url}")
    print("Keep this window open. Close it to quit MyJobCoach.")
    print("If your browser says it cannot connect, wait a moment and refresh.")
    webbrowser.open(url)
    _serve_forever()  # the server is a daemon thread; hold the process open


def _open_ui(url: str) -> None:
    try:
        import webview

        # pywebview defaults downloads off — they would silently do nothing.
        webview.settings["ALLOW_DOWNLOADS"] = True
        # Opens maximized (zoomed, not macOS full-screen); width/height are the
        # size the window un-zooms back to.
        webview.create_window(WINDOW_TITLE, url, width=1280, height=860,
                              min_size=(900, 600), maximized=True)
        # private_mode defaults to True, which discards localStorage between
        # runs — and the SPA keeps its UI-language and suggested-titles caches there.
        webview.start(private_mode=False, storage_path=str(paths.DATA_DIR / "webview"))
    except Exception:
        _browser_fallback(url)


def main() -> None:
    # In the packaged app, keep the downloaded Chromium in the writable data dir.
    if paths.FROZEN:
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(paths.BROWSERS_DIR))

    # Single-instance: if it's already running on the preferred port, just focus
    # a browser tab on it and exit instead of starting a second server.
    if _port_in_use(PREFERRED_PORT) and _is_our_app(PREFERRED_PORT):
        webbrowser.open(f"http://{HOST}:{PREFERRED_PORT}")
        return

    port = _pick_port()

    import uvicorn

    from app.api import system
    from app.main import app

    system.ensure_chromium()  # one-time Chromium download in the background

    threading.Thread(
        target=uvicorn.run,
        args=(app,),
        kwargs={"host": HOST, "port": port, "log_level": "warning"},
        daemon=True,
    ).start()
    _wait_ready(port)
    _open_ui(f"http://{HOST}:{port}")


if __name__ == "__main__":
    main()
