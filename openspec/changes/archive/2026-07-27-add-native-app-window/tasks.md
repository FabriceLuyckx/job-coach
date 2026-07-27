## 1. Dependency & packaging

- [x] 1.1 Add `pywebview` to the `package` extra in `pyproject.toml`; refresh `uv.lock`
- [x] 1.2 In `packaging/myjobcoach.spec`, collect the webview backend (`collect_all("webview")` plus `clr_loader`/`pythonnet` hidden imports on Windows), tolerating its absence the same way the `llama_cpp` block does
- [x] 1.3 Set `console=False` on the Windows `EXE` in `packaging/myjobcoach.spec`

## 2. Launcher: native window

- [x] 2.1 In `app/desktop.py`, move `uvicorn.run` into a daemon thread and keep the existing `_is_our_app` readiness wait as the gate before showing the window
- [x] 2.2 Create the window (`webview.create_window` at the app URL, app-name title, laptop-sized default, `min_size`) and run `webview.start()` on the main thread; returning from it ends the process
- [x] 2.3 Set `webview.settings['ALLOW_DOWNLOADS'] = True` before `start()`; leave `OPEN_EXTERNAL_LINKS_IN_BROWSER` at its default
- [x] 2.4 Pass `private_mode=False` and a `storage_path` under the writable data dir (`app/paths.py`) so the SPA's local storage survives restarts
- [x] 2.5 Rewrite the module docstring: what the launcher now does, and why the GUI loop owns the main thread

## 3. Launcher: fallback & single instance

- [x] 3.1 Wrap window creation so any import/start failure falls back to the current `webbrowser.open()` + blocking-server path, printing where the app is running
- [x] 3.2 On Windows, call `kernel32.AllocConsole()` in that fallback branch before printing, so the "close this window to quit" affordance returns exactly where it is needed; mark it with a `ponytail:` comment
- [x] 3.3 Confirm the already-running check still exits without starting a second server, and open the browser at the running instance as before

## 4. PDF download

- [x] 4.1 In `frontend/src/components/cv/CVEditor.tsx`, replace `downloadPDF()`'s fetch/blob/object-URL flow with a plain link to the PDF endpoint (which already sends `Content-Disposition: attachment`), keeping the control's current appearance
- [x] 4.2 Remove the now-dead download state, error toast key, and any i18n keys left unused by 4.1 (`en.json` only — never run the translation script)

## 5. Tests

- [x] 5.1 Add a test covering the launcher's fallback selection: when the webview backend is unavailable, the browser path is taken and the server still starts
- [x] 5.2 Run `uv run pytest` and `cd frontend && npm run build` (or `tsc`) clean

## 6. Docs

- [x] 6.1 Update `README.md`: the packaged app opens its own window, closing it quits, no console window on Windows
- [x] 6.2 Update `CLAUDE.md` (Phase 7 / desktop packaging): the launcher hosts a native web view, the browser is now the fallback, and the PDF download is a direct link

## Manual verification (untracked — run before release, per the updater precedent)

The window itself cannot be exercised in CI. Against real builds on macOS and
Windows: the window opens with the MyJobCoach icon in the Dock/taskbar, closing
it leaves no process behind, external links and a job listing open in the
default browser, a CV preview opens in a full browser tab, a PDF downloads,
each page renders correctly, ⌘Q / clipboard shortcuts work on macOS, and the UI
language survives a restart.
