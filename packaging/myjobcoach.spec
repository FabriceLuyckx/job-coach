# PyInstaller spec — builds the MyJobCoach double-click desktop bundle.
#
# Prerequisite: build the frontend first so frontend/dist exists to bundle:
#     cd frontend && npm run build
#
# Build:  pyinstaller packaging/myjobcoach.spec
# Output: dist/MyJobCoach/  (onedir)  and, on macOS, dist/MyJobCoach.app

import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, collect_submodules

ROOT = Path(SPECPATH).resolve().parent

# Read-only assets shipped inside the bundle, in the same relative layout the
# app expects (app/paths.py resolves them under sys._MEIPASS when frozen).
datas = [
    (str(ROOT / "templates" / "cv"), "templates/cv"),
    (str(ROOT / "frontend" / "dist"), "frontend/dist"),
    (str(ROOT / "profile" / "profile.example.json"), "profile"),
    # Reviewed CV section labels, read at runtime by cv_renderer.cv_labels().
    (str(ROOT / "app" / "i18n" / "cv_labels.json"), "app/i18n"),
    # English UI catalog + shipped locales — the on-device translator reads these
    # to generate Tier-2 languages (app/api/i18n.py, UI_LOCALES_SRC).
    (str(ROOT / "frontend" / "src" / "locales"), "frontend/src/locales"),
]
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
    console=True,  # Windows: the "keep open / close to quit" window
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
            "NSHighResolutionCapable": True,
        },
    )
