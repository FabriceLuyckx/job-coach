# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 Fabrice Luyckx

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import profile, cv, settings, jobs, system, backup, engine, i18n, letters
from app import db, paths


@asynccontextmanager
async def lifespan(_app: FastAPI):
    paths.seed_data_dir()
    db.init_db()
    yield


app = FastAPI(title="MyJobCoach", lifespan=lifespan)

# CORS only matters for the Vite dev server (cross-origin on :5173). The packaged
# app serves the frontend same-origin, where CORS is irrelevant.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def no_store(request, call_next):
    """Nothing but the hashed bundles may be cached.

    The app always lives at the same origin (127.0.0.1:8756) and the desktop
    web view keeps a persistent HTTP cache across restarts. `FileResponse`
    sends Last-Modified with no Cache-Control, which lets a browser *heuristically*
    treat an old index.html as fresh for days — so after a self-update the
    packaged app kept booting the previous frontend (an updated 0.8.0 still
    showing the pre-0.8 Settings copy) while the new backend ran underneath.
    /assets is content-hashed, so it stays cacheable.
    """
    resp = await call_next(request)
    if not request.url.path.startswith("/assets/"):
        resp.headers.setdefault("Cache-Control", "no-store")
    return resp


app.include_router(profile.router)
app.include_router(cv.router)
app.include_router(letters.router)
app.include_router(settings.router)
app.include_router(jobs.router)
app.include_router(system.router)
app.include_router(backup.router)
app.include_router(engine.router)
app.include_router(i18n.router)

FRONTEND_DIST = paths.FRONTEND_DIST

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        # Real files at the dist root (favicon.png, robots.txt — anything Vite
        # copies from public/) must win over the SPA fallback, or the browser
        # gets index.html as text/html and shows no icon.
        f = (FRONTEND_DIST / full_path).resolve()
        if full_path and f.is_relative_to(FRONTEND_DIST.resolve()) and f.is_file():
            return FileResponse(str(f))
        return FileResponse(str(FRONTEND_DIST / "index.html"))
