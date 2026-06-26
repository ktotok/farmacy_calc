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

## Architecture

Three tiers — **SQLite** (data) + **FastAPI** (backend) + **React/Vite/TS** (frontend).

```
backend/
  app/
    main.py            ← FastAPI app; lifespan seeds DB; mounts frontend/dist in prod
    db.py              ← SQLModel engine/session; SQLite at data/pharmacy.db; FK pragma
    models.py          ← SQLModel tables: Item, RecipeComponent (+ CHECK/FK constraints)
    schemas.py         ← Pydantic request/response models (422 on bad input)
    cost.py            ← server-side cost model (parity reference for the TS port)
    seed.py            ← CSV → SQLite migration (idempotent; runs if DB empty)
    routers/
      data.py          ← GET /api/data  → {items, recipes} (typed JSON)
      items.py         ← CRUD /api/items + PUT /api/items/prices/batch
      recipes.py       ← CRUD /api/recipes (orphan + cycle validation)
      io.py            ← /api/export/*.csv, /api/import/{items,recipes}
  tests/               ← pytest (shape, validation, cost anchors, CSV round-trip)
data/
  pharmacy.db          ← source of truth (gitignored; seed reproduces it)
  items.csv,
  recipe_components.csv ← seed source + import/export format (no longer read live)
frontend/
  src/
    api.ts             ← typed fetch client (throws ApiError with Ukrainian detail)
    costModel.ts       ← unitCost() port (client-side, instant recompute)
    constants.ts       ← SECTION_ORDER / SECTION_LABELS / ITEM_TYPE_LABELS
    App.tsx            ← tabs, price edits, toast, modals, CSV import/export
    components/        ← ItemCard, ItemForm, RecipeEditor
    costModel.test.ts  ← parity guard vs __fixtures__/expected_costs.json
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

### Integrity enforced by the DB / API (was impossible with flat CSVs)

- `item.type` is a closed enum (`raw|intermediate|product|shop`).
- Prices and `output_qty` have CHECK constraints (`>= 0`, `output_qty >= 1`).
- `recipe_component` has FK → `item.id` with `ON DELETE CASCADE`.
- Recipe edits rejected (422) on orphan component, self-reference, or cycle
  (see `routers/recipes.py::_creates_cycle`).
- Note: the seed auto-creates any recipe component missing from `items.csv` as a
  raw item with NULL `buy_price` (e.g. `wolfberry`), preserving FK integrity while
  keeping its dependents' cost unknown ("—").

### Items (`data/items.csv` columns / `Item` model)

| field | meaning |
|---|---|
| `type` | `raw` / `intermediate` / `product` / `shop` |
| `buy_price` | set for `raw` items, null for crafted |
| `sell_price` | set for items sold in-shop |
| `shop_section` | groups products in the Вироби tab |
| `components_complete` | `false` when recipe was not captured from screenshots |

### UI tabs

- **Вироби** — `product` items, grouped by `shop_section`
- **Проміжні** — `intermediate` items (crafted and used as ingredients elsewhere)
- **Сировина** — `raw` items with editable buy-price inputs
- **Зведення** — sortable profit summary across all crafted items

Each card has ✎ (edit item) and "рецепт" (edit recipe) actions; the top toolbar
has "+ Новий виріб" and CSV import/export.

### Adding a new shop_section label

Extend both constants in `frontend/src/constants.ts`:

```ts
export const SECTION_ORDER = [..., "new_key", "__other"];
export const SECTION_LABELS = { ..., new_key: "Українська назва" };
```

## Testing

```bash
cd backend && .venv/bin/python -m pytest tests/   # API + validation + cost anchors
cd frontend && npm test                            # cost-model parity (vitest)
```

If item/recipe data changes, regenerate the parity fixtures used by the frontend test:
run the backend, then dump `/api/data` → `frontend/src/__fixtures__/data.json` and
`all_unit_costs(...)` → `frontend/src/__fixtures__/expected_costs.json`.

## Style rules

- Font: **PT Serif** exclusively (`"PT Serif", Georgia, "Times New Roman", serif`). All UI text is Ukrainian/Cyrillic — do not introduce Latin-only decorative fonts.
- All user-visible strings are in Ukrainian.
