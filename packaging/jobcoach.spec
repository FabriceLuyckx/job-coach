# PyInstaller spec — builds the Job Coach double-click desktop bundle.
#
# Prerequisite: build the frontend first so frontend/dist exists to bundle:
#     cd frontend && npm run build
#
# Build:  pyinstaller packaging/jobcoach.spec
# Output: dist/JobCoach/  (onedir)  and, on macOS, dist/JobCoach.app

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
    name="JobCoach",
    console=True,  # Windows: the "keep open / close to quit" window
    icon=None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="JobCoach")

if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="JobCoach.app",
        icon=None,
        bundle_identifier="com.jobcoach.app",
        info_plist={
            "CFBundleName": "Job Coach",
            "NSHighResolutionCapable": True,
        },
    )
