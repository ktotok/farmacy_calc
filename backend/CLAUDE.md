Based on the error, I need to restore `items.csv` as inline code in the integrity section. The fix: "Seed auto-creates missing recipe components" → "Seed auto-creates any recipe component missing from `items.csv`".

# Backend (FastAPI)

FastAPI + SQLModel over SQLite. Root [CLAUDE.md](../CLAUDE.md) — architecture, data flow, cost model.

## Layout

```
backend/
  app/
    main.py            ← FastAPI app; lifespan calls init_db only; mounts frontend/dist in prod
    db.py              ← SQLModel engine/session; SQLite path from PHARMACY_DB (default data/pharmacy.db locally, /data/pharmacy.db in the image); logs resolved path on boot; FK pragma
    models.py          ← SQLModel tables: Item, RecipeComponent (+ CHECK/FK constraints)
    schemas.py         ← Pydantic request/response models (422 on bad input)
    cost.py            ← server-side cost model (parity reference for the TS port)
    seed.py            ← CSV → SQLite seed (idempotent; skips if DB has rows)
    migrate.py         ← Django-style SQL migration runner (tracks applied migrations in _migrations table)
    migrations/        ← numbered .sql files applied once by migrate.py
    routers/
      data.py          ← GET /api/data  → {items, recipes} (typed JSON)
      items.py         ← CRUD /api/items + PUT /api/items/prices/batch
      recipes.py       ← CRUD /api/recipes (orphan + cycle validation)
      io.py            ← /api/export/*.csv, /api/import/{items,recipes}
  tests/               ← pytest (shape, validation, cost anchors, CSV round-trip)
```

`cost.py` parity ref for cost model — keep lock-step with `frontend/src/costModel.ts` (root [CLAUDE.md](../CLAUDE.md) → Cost model).

## Integrity enforced by DB / API (impossible with flat CSVs)

- `item.type` closed enum (`raw|intermediate|product`).
- Prices + `output_qty` CHECK constraints (`>= 0`, `output_qty >= 1`).
- `recipe_component` FK → `item.id` `ON DELETE CASCADE`.
- Recipe edits rejected (422) on orphan component, self-reference, or cycle (`routers/recipes.py::_creates_cycle`).
- Seed auto-creates any recipe component missing from `items.csv` as raw item with NULL `buy_price` — preserves FK integrity, cost unknown ("—").

## Items (`data/items.csv` columns / `Item` model)

| field | meaning |
|---|---|
| `type` | `raw` / `intermediate` / `product` |
| `buy_price` | set for `raw` items, null for crafted |
| `sell_price` | set for items sold in-shop |
| `shop_section` | groups products in the Вироби tab |
| `components_complete` | `false` when recipe not captured from screenshots |

## Running

```bash
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only

# Seed + migrate once (idempotent — safe to re-run)
.venv/bin/python -m app.seed
.venv/bin/python -m app.migrate

# Start dev server
.venv/bin/uvicorn app.main:app --reload --port 8777
```

In Docker the entrypoint (`backend/entrypoint.sh`) runs seed → migrate → uvicorn automatically.

## Testing

```bash
cd backend && .venv/bin/python -m pytest tests/   # API + validation + cost anchors
```