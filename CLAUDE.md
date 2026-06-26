# farmacy_calc

A cost/profit calculator for the RedM "Аптека Роудс" pharmacy: it tracks raw
ingredients, intermediate crafts and finished products, computes the unit cost
of every craftable item from its recipe, and surfaces profit margins across the
shop. The whole app is in Ukrainian.

Tier-specific guidance lives next to the code it describes:

- [backend/CLAUDE.md](backend/CLAUDE.md) — FastAPI app, DB/API integrity rules,
  the `Item` model / CSV columns, backend tests.
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — React UI, tabs, the `shop_section`
  label pattern, fonts, frontend tests.

## Architecture

Three tiers — **SQLite** (data) + **FastAPI** (backend) + **React/Vite/TS** (frontend).

```
backend/    ← FastAPI app + cost model + CSV seed/import-export (see backend/CLAUDE.md)
data/
  pharmacy.db          ← source of truth (gitignored; seed reproduces it)
  items.csv,
  recipe_components.csv ← seed source + import/export format (no longer read live)
frontend/   ← React/Vite/TS client (see frontend/CLAUDE.md)
```

### Data flow

SQLite is the source of truth. `GET /api/data` returns all items + recipes as
typed JSON; the React client boots from it and recomputes costs client-side.
Writes go through the API (`/api/items`, `/api/recipes`, price batch) with
Pydantic + business-rule validation. The CSVs are only read at first-run seed and
via the import/export endpoints — editing a CSV no longer changes the app live;
re-import it (or delete `data/pharmacy.db` and re-seed) instead.

### Cost model

```
unit_cost(raw item)     = buy_price
unit_cost(crafted item) = Σ(unit_cost(component) × qty) / output_qty
```

Recursive with a cycle-guard `Set`; returns null (rendered "—") when a price is
unknown or a cycle is hit. Implemented twice and kept in lock-step:
`frontend/src/costModel.ts` (live UI) and `backend/app/cost.py` (test reference).
`costModel.test.ts` asserts they match for the seeded data.

## Running the app

Two processes in development (backend API + Vite dev server):

```bash
# 1. Backend (FastAPI). First run creates+seeds data/pharmacy.db from the CSVs.
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/uvicorn app.main:app --reload --port 8777

# 2. Frontend (React + Vite), proxies /api → 127.0.0.1:8777
cd frontend
npm install        # first time only
npm run dev        # http://127.0.0.1:5173
```

Single-process / production: `npm --prefix frontend run build` then start uvicorn
— `app/main.py` mounts `frontend/dist` as static files, so the whole app is served
from `http://127.0.0.1:8777`.

Preview (Claude): `.claude/launch.json` defines the `frontend` Vite server; the
backend still needs to be running separately for `/api`.

## Run as a Docker container

The whole app — FastAPI API, the built React frontend, and the SQLite DB — runs
from a single container off the repo-root `Dockerfile` (the same image Railway
deploys). It's a multi-stage build: `node:22` runs `npm run build`, then
`python:3.11` installs the backend deps and serves the API plus the built
`frontend/dist` as static files from one uvicorn process. No SQLite server is
needed — SQLite is an embedded file inside the container.

```bash
# Build the image (run from repo root)
docker build -t farmacy_calc .

# Run it. PORT defaults to 8777 inside the container; map it to the host.
# Mount a host dir at /data so the DB survives container restarts, and point
# PHARMACY_DB at it (keeps the seed CSVs at /app/data intact for first boot).
docker run --rm -p 8777:8777 \
  -e PHARMACY_DB=/data/pharmacy.db \
  -v "$(pwd)/.docker-data:/data" \
  farmacy_calc
```

Then open `http://127.0.0.1:8777` — frontend and `/api` are served from the same
origin. On first boot the DB seeds from the bundled CSVs (`Seeded DB from CSV: …`
in the logs); after that all in-app edits persist in the mounted volume and the
DB does **not** reseed.

## Deployment (Railway)

Hosted on Railway as a single Docker container (Dockerfile at repo root):
multi-stage build — `node:22` runs `npm run build`, then `python:3.11` serves the
API and the built `frontend/dist` from one process bound to `$PORT`.

- **Builder**: `railway.json` pins the Dockerfile builder + a `/api/data`
  healthcheck. `.dockerignore` excludes `node_modules`, `Medicine/`, the local DB.
- **Persistence**: the SQLite DB lives on a mounted Railway **Volume** (mount path
  `/data`), with env var `PHARMACY_DB=/data/pharmacy.db`. It seeds once from the
  CSVs on first boot (`Seeded DB from CSV: …` in the logs), then persists all
  in-app edits across deploys. The DB does **not** reseed once populated — to apply
  CSV data changes, re-import via the in-app CSV import.
- **Updates**: `git push` to `main` → Railway auto-rebuilds and redeploys.
- No app code is Railway-specific: the port comes from the Dockerfile CMD
  (`--port ${PORT}`) and the DB path from `PHARMACY_DB` (`backend/app/db.py`).
