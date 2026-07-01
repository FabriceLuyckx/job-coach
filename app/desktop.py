"""Desktop launcher — the packaged app's entry point.

Starts the FastAPI app on a local port and opens the user's default browser to
it. This is what the PyInstaller bundle runs when the user double-clicks the app;
it needs no terminal, Python, or extra setup on the user's machine.

Quit: close the window this prints to (Windows) or quit the app from the Dock
(macOS). No native GUI toolkit is involved — the UI is just the local web app in
whatever browser the user already has.
"""

import os
import socket
import threading
import time
import webbrowser
from urllib.request import urlopen

from app import paths

HOST = "127.0.0.1"
PREFERRED_PORT = 8756


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


def _open_when_ready(port: int) -> None:
    url = f"http://{HOST}:{port}"
    for _ in range(100):  # wait up to ~10s for the server to answer
        if _is_our_app(port):
            break
        time.sleep(0.1)
    webbrowser.open(url)


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

    threading.Thread(target=_open_when_ready, args=(port,), daemon=True).start()

    print(f"Job Coach is running at http://{HOST}:{port}")
    print("Keep this window open. Close it to quit Job Coach.")
    uvicorn.run(app, host=HOST, port=port, log_level="warning")


if __name__ == "__main__":
    main()
