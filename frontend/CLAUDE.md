# Frontend (React + Vite + TS)

React/Vite/TS client that boots from `GET /api/data`, recomputes costs
client-side. See root [CLAUDE.md](../CLAUDE.md) for overall architecture, data
flow, cost model description.

## Layout

```
frontend/
  src/
    api.ts             ← typed fetch client (throws ApiError with Ukrainian detail)
    costModel.ts       ← unitCost() port (client-side, instant recompute)
    sales.ts           ← pure sales helpers (periodBounds / aggregateByItem)
    constants.ts       ← SECTION_ORDER / SECTION_LABELS / ITEM_TYPE_LABELS / PERIOD_LABELS
    App.tsx            ← tabs, price edits, toast, modals, CSV import/export
    components/        ← ItemCard, ItemForm, RecipeEditor, SalesTab, SalesReport
    costModel.test.ts  ← parity guard vs __fixtures__/expected_costs.json
    sales.test.ts      ← period bucketing + aggregation unit tests
```

`costModel.ts` is live port of cost model — keep in lock-step with
`backend/app/cost.py` (see root [CLAUDE.md](../CLAUDE.md) → Cost model).

## UI tabs

- **Вироби** — `product` items, grouped by `shop_section`
- **Проміжні** — `intermediate` items (crafted, used as ingredients elsewhere)
- **Сировина** — `raw` items with editable buy-price inputs
- **Зведення** — day/week/month report of **sold products** (виторг / собівартість /
  прибуток / маржа), aggregated by item (`components/SalesReport.tsx`). `sales.ts`
  computes the period window in local time (week from Monday) → UTC `[start, end)`,
  which the server filters (`GET /api/sales?start&end`); `aggregateByItem` groups
  the returned rows.
- **Продажі** — record a sale (item + qty + price + date) + a recent-sales list with
  delete (`components/SalesTab.tsx`). Sales are an append-only ledger snapshotting
  price + cost at sale time (`GET/POST/DELETE /api/sales`), so new/edited/deleted
  items never rewrite past reports.

Each card has ✎ (edit item) + "рецепт" (edit recipe) actions; top toolbar has
"+ Новий виріб" + CSV import/export.

## Adding a new shop_section label

Extend both constants in `frontend/src/constants.ts`:

```ts
export const SECTION_ORDER = [..., "new_key", "__other"];
export const SECTION_LABELS = { ..., new_key: "Українська назва" };
```

## Style rules

- Font: **PT Serif** exclusively (`"PT Serif", Georgia, "Times New Roman", serif`). All UI text Ukrainian/Cyrillic — do not introduce Latin-only decorative fonts.
- All user-visible strings in Ukrainian.

## Running

```bash
# React + Vite, proxies /api → 127.0.0.1:8777 (backend must be running too)
cd frontend
npm install        # first time only
npm run dev        # http://127.0.0.1:5173
```

## Testing

```bash
cd frontend && npm test   # cost-model parity (vitest)
```

If item/recipe data changes, regenerate parity fixtures: run backend, then dump
`/api/data` → `src/__fixtures__/data.json` and `all_unit_costs(...)` →
`src/__fixtures__/expected_costs.json`.
