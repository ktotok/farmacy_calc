# Backend (FastAPI)

FastAPI + SQLModel over SQLite. See the root [CLAUDE.md](../CLAUDE.md) for the
overall architecture, data flow and the cost model description.

## Layout

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
```

`cost.py` is the parity reference for the cost model — keep it in lock-step with
`frontend/src/costModel.ts` (see root [CLAUDE.md](../CLAUDE.md) → Cost model).

## Integrity enforced by the DB / API (was impossible with flat CSVs)

- `item.type` is a closed enum (`raw|intermediate|product|shop`).
- Prices and `output_qty` have CHECK constraints (`>= 0`, `output_qty >= 1`).
- `recipe_component` has FK → `item.id` with `ON DELETE CASCADE`.
- Recipe edits rejected (422) on orphan component, self-reference, or cycle
  (see `routers/recipes.py::_creates_cycle`).
- Note: the seed auto-creates any recipe component missing from `items.csv` as a
  raw item with NULL `buy_price` (e.g. `wolfberry`), preserving FK integrity while
  keeping its dependents' cost unknown ("—").

## Items (`data/items.csv` columns / `Item` model)

| field | meaning |
|---|---|
| `type` | `raw` / `intermediate` / `product` / `shop` |
| `buy_price` | set for `raw` items, null for crafted |
| `sell_price` | set for items sold in-shop |
| `shop_section` | groups products in the Вироби tab |
| `components_complete` | `false` when recipe was not captured from screenshots |

## Running

```bash
# First run creates+seeds data/pharmacy.db from the CSVs.
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # first time only
.venv/bin/uvicorn app.main:app --reload --port 8777
```

## Testing

```bash
cd backend && .venv/bin/python -m pytest tests/   # API + validation + cost anchors
```
