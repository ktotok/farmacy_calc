# Frontend (React + Vite + TS)

React/Vite/TS client that boots from `GET /api/data` and recomputes costs
client-side. See the root [CLAUDE.md](../CLAUDE.md) for the overall architecture,
data flow and the cost model description.

## Layout

```
frontend/
  src/
    api.ts             ← typed fetch client (throws ApiError with Ukrainian detail)
    costModel.ts       ← unitCost() port (client-side, instant recompute)
    constants.ts       ← SECTION_ORDER / SECTION_LABELS / ITEM_TYPE_LABELS
    App.tsx            ← tabs, price edits, toast, modals, CSV import/export
    components/        ← ItemCard, ItemForm, RecipeEditor
    costModel.test.ts  ← parity guard vs __fixtures__/expected_costs.json
```

`costModel.ts` is the live port of the cost model — keep it in lock-step with
`backend/app/cost.py` (see root [CLAUDE.md](../CLAUDE.md) → Cost model).

## UI tabs

- **Вироби** — `product` items, grouped by `shop_section`
- **Проміжні** — `intermediate` items (crafted and used as ingredients elsewhere)
- **Сировина** — `raw` items with editable buy-price inputs
- **Зведення** — sortable profit summary across all crafted items

Each card has ✎ (edit item) and "рецепт" (edit recipe) actions; the top toolbar
has "+ Новий виріб" and CSV import/export.

## Adding a new shop_section label

Extend both constants in `frontend/src/constants.ts`:

```ts
export const SECTION_ORDER = [..., "new_key", "__other"];
export const SECTION_LABELS = { ..., new_key: "Українська назва" };
```

## Style rules

- Font: **PT Serif** exclusively (`"PT Serif", Georgia, "Times New Roman", serif`). All UI text is Ukrainian/Cyrillic — do not introduce Latin-only decorative fonts.
- All user-visible strings are in Ukrainian.

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

If item/recipe data changes, regenerate the parity fixtures: run the backend,
then dump `/api/data` → `src/__fixtures__/data.json` and `all_unit_costs(...)` →
`src/__fixtures__/expected_costs.json`.
