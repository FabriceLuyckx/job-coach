# PyInstaller spec — builds the MyJobCoach double-click desktop bundle.
#
# Prerequisite: build the frontend first so frontend/dist exists to bundle:
#     cd frontend && npm run build
#
# Build:  pyinstaller packaging/myjobcoach.spec
# Output: dist/MyJobCoach/  (onedir)  and, on macOS, dist/MyJobCoach.app

import sys
import tomllib
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules, copy_metadata

ROOT = Path(SPECPATH).resolve().parent

# Read-only assets shipped inside the bundle, in the same relative layout the
# app expects (app/paths.py resolves them under sys._MEIPASS when frozen).
datas = [
    (str(ROOT / "templates" / "cv"), "templates/cv"),
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    # Reviewed CV section labels, read at runtime by cv_renderer.cv_labels().
    (str(ROOT / "app" / "i18n" / "cv_labels.json"), "app/i18n"),
    # English UI catalog + shipped locales — the on-device translator reads these
    # to generate Tier-2 languages (app/api/i18n.py, UI_LOCALES_SRC).
    (str(ROOT / "frontend" / "src" / "locales"), "frontend/src/locales"),
]
# Bundle the package dist-info so importlib.metadata.version("myjobcoach") — the
# first branch of system.app_version() — resolves inside the frozen app; without
# it /api/version and the About modal read "unknown" (source of __file__ is the
# PYZ archive, so the pyproject.toml fallback can't work when frozen).
datas += copy_metadata("myjobcoach")
binaries = []

# uvicorn's auto-selected loop/protocol impls are imported lazily, so name them.
hiddenimports = collect_submodules("uvicorn") + [
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
    "uvicorn.lifespan.on",
]

# Bundle Playwright's node driver so first-run `playwright install chromium`
# works inside the frozen app. The browser itself is downloaded at runtime.
pw_datas, pw_binaries, pw_hidden = collect_all("playwright")
datas += pw_datas
binaries += pw_binaries
hiddenimports += pw_hidden

# Free local AI engine. Collect llama-cpp-python's native library (Metal dylib on
# macOS arm64, AVX2 CPU libs elsewhere) when the `local` extra is installed; skip
# cleanly if this build targets the OpenRouter-only configuration.
try:
    lc_datas, lc_binaries, lc_hidden = collect_all("llama_cpp")
    datas += lc_datas
    binaries += lc_binaries
    hiddenimports += lc_hidden
except Exception:
    print("llama_cpp not installed — building without the local AI engine.")

# Native app window (pywebview → WKWebView/WebView2). Skip cleanly if absent —
# the launcher falls back to the browser at runtime the same way.
try:
    wv_datas, wv_binaries, wv_hidden = collect_all("webview")
    datas += wv_datas
    binaries += wv_binaries
    hiddenimports += wv_hidden
    if sys.platform == "win32":
        hiddenimports += ["clr_loader", "pythonnet"]
    if sys.platform.startswith("linux"):
        # pywebview's Qt backend imports these through qtpy at runtime, so name
        # them to trigger PyInstaller's Qt hooks (which also bundle
        # QtWebEngineProcess + its resources).
        hiddenimports += [
            "PyQt6.QtWebEngineWidgets",
            "PyQt6.QtWebChannel",
            "PyQt6.QtPrintSupport",
        ]
        # Window/taskbar icon + the .desktop entry the launcher installs
        # (app/desktop.py reads it from RESOURCE_DIR/packaging/).
        datas += [(str(ROOT / "packaging" / "icon-1024.png"), "packaging")]
except Exception:
    print("pywebview not installed — building with the browser launcher only.")

a = Analysis(
    [str(ROOT / "app" / "desktop.py")],
    pathex=[str(ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="MyJobCoach",
    console=False,  # the app owns a native window now; no console on Windows
    icon=str(ROOT / "packaging" / "icon.ico") if sys.platform == "win32" else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="MyJobCoach")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="MyJobCoach.app",
        icon=str(ROOT / "packaging" / "icon.icns"),
        bundle_identifier="com.myjobcoach.app",
        info_plist={
            "CFBundleName": "MyJobCoach",
            # Shown by the native About panel (the app menu's own About item).
            "CFBundleShortVersionString": tomllib.loads(
                (ROOT / "pyproject.toml").read_text()
            )["project"]["version"],
            "NSHighResolutionCapable": True,
        },
    )
