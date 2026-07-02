from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from app.api import profile, cv, settings, jobs, system, backup
from app import db, paths


@asynccontextmanager
async def lifespan(_app: FastAPI):
    paths.seed_data_dir()
    db.init_db()
    yield


app = FastAPI(title="Job Coach", lifespan=lifespan)

# CORS only matters for the Vite dev server (cross-origin on :5173). The packaged
# app serves the frontend same-origin, where CORS is irrelevant.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(profile.router)
app.include_router(cv.router)
app.include_router(settings.router)
app.include_router(jobs.router)
app.include_router(system.router)
app.include_router(backup.router)

FRONTEND_DIST = paths.FRONTEND_DIST

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def serve_spa(full_path: str):
        return FileResponse(str(FRONTEND_DIST / "index.html"))
