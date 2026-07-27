# Give the packaged app its own window and Dock icon

Phase 7 (Cloud Deployment / desktop packaging) — refines how the packaged
double-click bundle presents itself. No backend or AI behaviour changes.

## Why

The packaged app opens the user's default browser at `http://127.0.0.1:<port>`
(`app/desktop.py`). It therefore has no window of its own: it is one tab among
twenty, it can be closed without quitting, its identity is the browser's chrome,
and on Windows the only visible "app" is a console window telling you not to
close it. Non-technical users lose the app. It should look like an app.

## What Changes

- The packaged launcher hosts the UI in a **native application window**
  (macOS WKWebView / Windows WebView2 via `pywebview`) owned by the MyJobCoach
  process, so the running app carries the MyJobCoach icon in the Dock/taskbar
  and closing the window quits it.
- The uvicorn server moves to a background thread; the window loop owns the
  main thread. The server stays bound to loopback exactly as today.
- Links that mean "leave the app" — job listings, GitHub/licence, OpenRouter,
  a CV preview in a full tab — keep opening in the **real browser**, not inside
  the app window.
- **PDF download is simplified, not adapted**: the current blob + synthetic
  `<a download>` dance is deleted in favour of a plain link to
  `/api/cv/pdf/...`, which already returns `Content-Disposition: attachment`.
  WKWebView cannot download `blob:` URLs at all, so this is both the smaller
  diff and the fix.
- If no webview backend is available (missing WebView2 runtime, unsupported
  platform), the launcher **falls back to today's browser behaviour** rather
  than failing to start.
- Windows: the console window is dropped, since it is no longer the app's only
  visible surface or its quit affordance.

## Capabilities

### New Capabilities
- `desktop-app-window`: how the packaged application presents itself as a
  desktop app — its own window and icon, quit semantics, external-link and
  download handling, and the browser fallback.

### Modified Capabilities

_None._ No existing spec asserts how the app is opened.

## Impact

- **Code**: `app/desktop.py` (window loop, threading, fallback);
  `packaging/myjobcoach.spec` (hidden imports, `console=False` on Windows);
  `frontend/src/components/cv/CVEditor.tsx` (PDF link).
- **Dependencies**: new `pywebview` in the `package` extra, pulling pyobjc
  (macOS) / pythonnet (Windows). Both platforms ship the web engine itself
  (WKWebView, WebView2 on Win10+), so nothing extra is downloaded at runtime.
- **Unaffected**: `uv run uvicorn app.main:app` for development, all API
  routes, Playwright/Chromium (still used server-side for PDF), the updater's
  install-and-relaunch flow, and CI release workflows.
- **Docs**: README (how to run/quit the packaged app), CLAUDE.md (Phase 7).
