# farmacy_calc

Cost/profit calculator for RedM "Аптека Роудс" pharmacy. Track raw ingredients,
intermediate crafts, finished products; compute unit cost of every craftable item
from its recipe; surface profit margins across shop. Whole app Ukrainian.

Tier-specific guidance lives next to code it describes:

- [backend/CLAUDE.md](backend/CLAUDE.md) — FastAPI app, DB/API integrity rules,
  `Item` model / CSV columns, backend tests.
- [frontend/CLAUDE.md](frontend/CLAUDE.md) — React UI, tabs, `shop_section`
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

SQLite = source of truth. `GET /api/data` returns all items + recipes as typed
JSON; React client boots from it, recomputes costs client-side. Writes go through
API (`/api/items`, `/api/recipes`, price batch) with Pydantic + business-rule
validation. CSVs read only at first-run seed + via import/export endpoints —
editing a CSV no longer changes app live; re-import it (or delete
`data/pharmacy.db` and re-seed) instead.

### Cost model

```
unit_cost(raw item)     = buy_price
unit_cost(crafted item) = Σ(unit_cost(component) × qty) / output_qty
```

Recursive with cycle-guard `Set`; returns null (rendered "—") when price unknown
or cycle hit. Implemented twice, kept in lock-step: `frontend/src/costModel.ts`
(live UI) and `backend/app/cost.py` (test reference). `costModel.test.ts` asserts
they match for seeded data.

## Running the app

Two processes in development (backend API + Vite dev server):

```bash
# 1. Backend (FastAPI).
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/python -m app.seed     # seed DB from CSVs (idempotent; run once)
.venv/bin/python -m app.migrate  # apply SQL migrations (idempotent; run once)
.venv/bin/uvicorn app.main:app --reload --port 8777

# 2. Frontend (React + Vite), proxies /api → 127.0.0.1:8777
cd frontend
npm install        # first time only
npm run dev        # http://127.0.0.1:5173
```

Single-process / production: `npm --prefix frontend run build` then start uvicorn
— `app/main.py` mounts `frontend/dist` as static files, so whole app served from
`http://127.0.0.1:8777`.

Preview (Claude): `.claude/launch.json` defines `frontend` Vite server; backend
still needs to run separately for `/api`.

## Run as a Docker container

Whole app — FastAPI API, built React frontend, SQLite DB — runs from single
container off repo-root `Dockerfile` (same image Railway deploys). Multi-stage
build: `node:22` runs `npm run build`, then `python:3.11` installs backend deps +
serves API plus built `frontend/dist` as static files from one uvicorn process.
No SQLite server needed — SQLite is embedded file inside container.

```bash
# Build the image (run from repo root)
docker build -t farmacy_calc .

# Run it. PORT defaults to 8777 inside the container; map it to the host.
# Mount a host dir at /data so the DB survives container restarts. The image
# already defaults PHARMACY_DB=/data/pharmacy.db (Dockerfile ENV), so only the
# volume mount is required. Mount at /data, NOT /app/data — mounting over
# /app/data would shadow the baked-in seed CSVs and break first-boot seeding.
docker run --rm -p 8777:8777 \
  -v "$(pwd)/.docker-data:/data" \
  farmacy_calc
```

Then open `http://127.0.0.1:8777` — frontend and `/api` served from same origin.
Boot logs show the resolved DB path (`[db] Using SQLite at /data/pharmacy.db`) and,
on first boot, the seed (`Seed result: {'items': …}`). After that all in-app edits
persist in the mounted volume and the DB does **not** reseed (`{'skipped': True}`).

## Deployment (Railway)

Hosted on Railway as single Docker container (Dockerfile at repo root):
multi-stage build — `node:22` runs `npm run build`, then `python:3.11` serves API
and built `frontend/dist` from one process bound to `$PORT`.

- **Builder**: `railway.json` pins Dockerfile builder + a `/api/data`
  healthcheck. `.dockerignore` excludes `node_modules`, `Medicine/`, local DB.
- **Persistence**: SQLite DB lives on mounted Railway **Volume** (mount path
  `/data`). The DB path is baked into the image (`ENV PHARMACY_DB=/data/pharmacy.db`
  in the Dockerfile), so Railway only needs the volume — no service variable
  required (any dashboard `PHARMACY_DB` is redundant). Mount path **must** be `/data`,
  never `/app/data` (that would shadow the baked-in seed CSVs). Seeds once from CSVs
  on first boot (`Seed result: {'items': …}` in logs), then persists all in-app edits
  across deploys; DB does **not** reseed once populated (`{'skipped': True}`) — to
  apply CSV data changes, re-import via in-app CSV import.
- **Updates**: `git push` to `main` → Railway auto-rebuilds + redeploys.
- No app code Railway-specific: port comes from Dockerfile CMD (`--port ${PORT}`)
  and DB path from `PHARMACY_DB` (`backend/app/db.py`).
