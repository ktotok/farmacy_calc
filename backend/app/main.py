"""Аптека Роудс — FastAPI backend.

SQLite is the source of truth. On startup the DB is created and, if empty,
seeded from the CSVs in data/. In production the built React app
(frontend/dist) is served as static files so the whole thing is one process;
in dev the Vite server proxies /api here.
"""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlmodel import Session

from .db import engine, init_db
from .routers import data, io, items, recipes
from .seed import seed

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST = os.path.join(ROOT, "frontend", "dist")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    with Session(engine) as session:
        result = seed(session)
    if not result.get("skipped"):
        print("Seeded DB from CSV:", result)
    yield


app = FastAPI(title="Аптека Роудс API", version="1.0.0", lifespan=lifespan)

# Dev: Vite (5173) proxies /api, but allow direct cross-origin too.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(items.router)
app.include_router(recipes.router)
app.include_router(io.router)


# Serve the built frontend in production (mounted last so /api wins).
if os.path.isdir(DIST):
    app.mount("/", StaticFiles(directory=DIST, html=True), name="frontend")
