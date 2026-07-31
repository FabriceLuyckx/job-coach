# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

"""Desktop launcher — the packaged app's entry point.

Starts the FastAPI app on a local port in a background thread, then hosts the
UI in a native application window (WKWebView on macOS, WebView2 on Windows,
QtWebEngine on Linux, via pywebview) so the running app has its own
Dock/taskbar icon and closing the window quits it. The GUI event loop must own the main thread — that is why
the *server* is the one in a thread: ``webview.start()`` blocks until the last
window closes, and when it returns, ``main()`` ends and the daemon server
thread dies with the process. Closing the window *is* the quit path.

If no web view backend is available (e.g. a missing WebView2 runtime), the
launcher falls back to the old behaviour: open the user's default browser at
the local address and keep the process alive until the user kills it.
"""

import os
import shutil
import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path
from urllib.request import urlopen

from app import paths

HOST = "127.0.0.1"
PREFERRED_PORT = 8756
WINDOW_TITLE = "MyJobCoach"
LOG_PATH = paths.DATA_DIR / "myjobcoach.log"
# Bundled by the spec on Linux only — the window/taskbar icon and the source
# of the installed .desktop entry's icon.
ICON_PATH = paths.RESOURCE_DIR / "packaging" / "icon-1024.png"


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


def _redirect_stdio() -> None:
    """Give the process real stdout/stderr, and a log file to keep them in.

    A windowed build (``console=False``) leaves both as ``None`` on Windows.
    uvicorn's log formatter calls ``sys.stdout.isatty()`` while configuring
    logging, so ``uvicorn.run()`` died on AttributeError before it ever bound —
    and the thread excepthook had nowhere to print it either. That is the whole
    of the "console says running, browser says ERR_CONNECTION_REFUSED" report:
    not a slow start, a server that never existed. The log file means the next
    startup failure is readable instead of guessed at.
    """
    if sys.stdout and sys.stderr:
        return
    try:
        f = open(LOG_PATH, "a", buffering=1, encoding="utf-8", errors="replace")
    except OSError:
        f = open(os.devnull, "w")
    sys.stdout = sys.stdout or f
    sys.stderr = sys.stderr or f


def _serve_forever() -> None:
    threading.Event().wait()


def _browser_fallback(url: str, ready: bool = True) -> None:
    """No usable web view — today's pre-window behaviour: browser + a console."""
    if sys.platform == "win32":
        # ponytail: console=False removed the quit window; restore it only on
        # this path, the one that still needs "close this window to quit".
        import ctypes

        ctypes.windll.kernel32.AllocConsole()
        sys.stdout = sys.stderr = open("CONOUT$", "w")
    if ready:
        print(f"MyJobCoach is running at {url}")
        print("Keep this window open. Close it to quit MyJobCoach.")
        print("If your browser says it cannot connect, wait a moment and refresh.")
    else:
        # Never claim it is running when it demonstrably is not — that is what
        # sent the last report chasing a browser problem for a dead server.
        print("MyJobCoach failed to start: nothing is listening on", url)
        print(f"Details were written to: {LOG_PATH}")
        print("Please send that file along with your bug report.")
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
        kwargs = {}
        if sys.platform == "linux":
            # Qt is the backend we bundle (see the `package` extra) — name it
            # so pywebview doesn't probe for GTK first. `icon` is only
            # honoured on GTK/Qt, hence Linux-only.
            kwargs["gui"] = "qt"
            if ICON_PATH.is_file():
                kwargs["icon"] = str(ICON_PATH)
        # private_mode defaults to True, which discards localStorage between
        # runs — and the SPA keeps its UI-language and suggested-titles caches there.
        webview.start(private_mode=False, storage_path=str(paths.DATA_DIR / "webview"), **kwargs)
    except Exception:
        _browser_fallback(url)


def _install_desktop_entry() -> None:
    """Linux app-menu/taskbar integration: copy the icon into the user's icon
    dir and (re)write a .desktop entry pointing at the current binary.

    Rewritten on every launch so Exec stays correct if the user moves the
    install. The file is named after the binary ("MyJobCoach") because Wayland
    compositors pick the taskbar icon by matching the window's app id — the
    binary name for Qt apps — against the .desktop file name; a window icon
    alone is ignored there.
    """
    data_home = Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share")
    icon = data_home / "icons" / "MyJobCoach.png"
    icon.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ICON_PATH, icon)
    apps = data_home / "applications"
    apps.mkdir(parents=True, exist_ok=True)
    (apps / "MyJobCoach.desktop").write_text(f"""[Desktop Entry]
Type=Application
Name=MyJobCoach
Comment=AI-powered career assistant
Exec="{sys.executable}"
Icon={icon}
Terminal=false
Categories=Office;
StartupWMClass=MyJobCoach
""")


def main() -> None:
    _redirect_stdio()
    # In the packaged app, keep the downloaded Chromium in the writable data dir.
    if paths.FROZEN:
        os.environ.setdefault("PLAYWRIGHT_BROWSERS_PATH", str(paths.BROWSERS_DIR))
        if sys.platform == "linux" and ICON_PATH.is_file():
            try:
                _install_desktop_entry()
            except Exception:
                pass  # menu integration is cosmetic — never block launch on it

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
    url = f"http://{HOST}:{port}"
    if _wait_ready(port):
        _open_ui(url)
    else:
        _browser_fallback(url, ready=False)


if __name__ == "__main__":
    main()
