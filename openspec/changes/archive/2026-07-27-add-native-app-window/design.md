## Context

`app/desktop.py` is the packaged app's entry point. Today it picks a loopback
port, starts uvicorn on the main thread, and (from a helper thread, once
`/api/health` answers) calls `webbrowser.open()`. There is no GUI toolkit
anywhere in the bundle. On macOS the `.app` shows in the Dock but owns no
window; on Windows the PyInstaller `EXE` is built with `console=True` and the
console *is* the app's only visible surface and its quit affordance.

The UI itself is a plain SPA served from the same origin as the API, so any
embedded web view can host it unchanged. Two client behaviours are
webview-sensitive: `target="_blank"` links (external sites, job listings, the
CV preview) and `CVEditor.downloadPDF()`, which fetches the PDF, wraps it in
`URL.createObjectURL`, and clicks a synthetic `<a download>`.

## Goals / Non-Goals

**Goals**

- The packaged app owns a window and a Dock/taskbar identity.
- Closing the window quits everything; no console window on Windows.
- Downloads and external links keep working, in the window and in a browser.
- Never make the app *unstartable* — a missing web view runtime degrades to
  today's behaviour.

**Non-Goals**

- No Linux packaging (none exists today).
- No native menus, tray icon, notifications, deep links, or window
  state persistence beyond what the toolkit gives for free.
- No change to the SPA's layout, routing, or design system — this change
  swaps the container, not the interface.
- No cross-process window focusing on a second launch.

## Decisions

### Embed a web view in-process (`pywebview`) rather than drive a browser

The requirement is a Dock icon owned by *this* app, and the Dock icon follows
the process that owns the window. That rules out every approach that hands the
UI to another program:

- **Chromium `--app=` mode** (including the Chromium the app already downloads
  for PDF rendering): zero new dependencies, but the window belongs to
  Chromium and shows Chromium's icon. It also fails outright for the intended
  audience's default browser when that browser is Firefox.
- **Electron / Tauri**: a second runtime and a second build toolchain for a
  Python app that already builds cleanly with PyInstaller. Enormous for the
  problem.
- **Hand-rolled WKWebView/WebView2 bindings** via pyobjc / pythonnet: no new
  top-level dependency, but two platform-specific bridges to write and
  maintain — strictly more code than the library that already wraps them.

`pywebview` is the thin wrapper over the OS's own web view (WKWebView on
macOS, WebView2 on Windows). It ships nothing to render with; both target
platforms already have the engine. PyInstaller has a bundled hook for it.

### uvicorn moves to a daemon thread; the GUI loop owns the main thread

`webview.start()` must run on the main thread and blocks until the last window
closes. So: start uvicorn in a daemon thread, wait for `/api/health` (the
existing readiness probe, reused), create the window at the app URL, then
`start()`. When `start()` returns, the process falls off the end of `main()`
and the daemon server thread dies with it — that *is* the quit path, no
teardown code.

### Settings: downloads on, external links out, storage persisted

- `ALLOW_DOWNLOADS = True` (pywebview default is `False`, so downloads would
  silently do nothing).
- `OPEN_EXTERNAL_LINKS_IN_BROWSER` is already the default `True`, which is
  exactly what the spec wants — every `target="_blank"` in the SPA is either an
  external site or a CV preview meant for a full tab.
- `private_mode=False` with a `storage_path` under the app's data dir.
  **This is not optional**: pywebview defaults to private mode, which discards
  local storage between runs, and the SPA keeps the UI-language cache
  (`i18n.ts`) and the suggested-titles cache (`Preferences.tsx`) there.
- macOS default menus stay on — they are what supply ⌘Q, ⌘W and clipboard
  shortcuts inside a WKWebView.

### Delete the PDF blob path instead of adapting it

WKWebView cannot download `blob:` URLs (WebKit bug 216918), so
`downloadPDF()`'s object-URL round trip is broken in the window *and*
redundant everywhere: `GET /api/cv/pdf/{slug}/{lang}` already responds with
`Content-Disposition: attachment`. Replacing the handler with a plain anchor to
that URL removes code, removes the `fetch`/blob/revoke lifecycle, and fixes the
web view in the same edit. The visible control keeps its current appearance —
this is a mechanism change, not a design change.

### Fallback: browser, plus a console on Windows

If importing or starting the web view raises, fall back to today's
`webbrowser.open()` path. On Windows that leaves the user with no way to quit,
since `console=False` will have removed the window they used to close — so the
fallback branch calls `kernel32.AllocConsole()` first, restoring exactly the
pre-change affordance for exactly the case that needs it. Roughly three lines,
in the branch that is expected almost never to run (WebView2 ships with
Windows 11 and evergreen Windows 10).

### Packaging

`pywebview` joins the `package` extra, which is what CI already installs
(`uv sync --extra package --extra local`). Semantically it is a runtime
dependency of the bundle rather than a build tool, but that extra *is* "the
desktop bundle's dependencies", and keeping it out of the base install means a
source checkout and the CLI scripts stay unaffected. Windows needs
`clr_loader` / `pythonnet` named as hidden imports; macOS needs the pyobjc
frameworks, which the bundled hook plus `collect_all("webview")` cover.
`console=False` for the Windows `EXE`.

## Risks / Trade-offs

- **WebView2 runtime missing on an old Windows 10 install** → the fallback
  branch above; the app still runs, just in a browser.
- **A WKWebView/WebView2 rendering difference breaks some UI** → the SPA is
  ordinary React on modern engines (Safari-class and Chromium-class); a manual
  pass over each page on both platforms is a task, not an assumption. The
  existing note that this project is verified on Firefox as well as Chromium
  applies unchanged — the browser path is not going away.
- **Bundle size grows** (pyobjc frameworks / pythonnet) → tens of MB on a
  bundle that already carries Chromium-fetching Playwright and llama.cpp.
  Accepted.
- **The window cannot be GUI-tested in CI** → the same position as the
  updater's install-and-relaunch: unit-test the decision logic (port choice,
  fallback selection) and verify the window manually against real builds on
  both platforms before release.
- **Second launch still just opens a browser tab at the running instance**
  rather than focusing the existing window. Cross-process window focus needs
  platform-specific IPC; the spec only requires that no second server starts,
  which the existing check already guarantees.
