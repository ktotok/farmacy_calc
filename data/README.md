# Pharmacy crafting data

Normalized dataset extracted from the in-game pharmacy screenshots in `../Medicine/`
(RedM/RDR2 roleplay — "Аптека Роудс" shop + "ВИГОТОВЛЕННЯ" crafting book). This is the
**live data source** for the calculator app in `../web/`.

## How the app uses these files

Run the app with `python3 ../server.py` (port 8777). The server reads these CSVs
**on every page load** — edit a CSV and refresh the browser to see structural changes
(new items, renamed items, changed recipes, sections, output quantities, etc.).

Prices set in the app are written **back into `items.csv`** — `buy_price` for raw items
and `sell_price` for products — via `POST /api/prices`. There is no localStorage; the
CSV is the single source of truth, so prices survive refreshes and are diff-friendly.
The CSV parser locates the header row by its first column (`id`), so row order and even
a non-first header position are tolerated.

## Files

### `items.csv`
One row per item. Columns:

| column | meaning |
|--------|---------|
| `id` | stable `snake_case` latin key (use as primary key / i18n key) |
| `name_uk` | original Ukrainian name from the game |
| `category` | loose grouping (herbs, extract, tonic, mixture, animal, drug, bandage, raw, misc…) |
| `type` | `raw`, `intermediate` (crafted & used in other recipes), `product` (crafted final good), `shop` (sold in shop, no captured recipe) |
| `buy_price` | **user-editable input.** Set for every `raw` item (default `0`). This is the per-unit purchase price the app uses to roll up crafted-item cost. Blank for crafted items (their cost is derived). |
| `craft_level` | required crafting level (`Вимога`) |
| `craft_time` | craft duration `mm:ss` |
| `craft_exp` | EXP granted |
| `output_qty` | units produced per craft |
| `shop_section` | shop page the item appears on (MISCELLANEOUS / BANDAGES / MIXTURE / ANTIDOTE) |
| `sell_price` | shop sell price in `$` |
| `components_complete` | `false` when the recipe's components were not captured |
| `notes` | caveats / OCR remarks |

### `recipe_components.csv`
The many-to-many recipe graph. Columns: `product_id`, `component_id`, `quantity`.
Each `product_id` and `component_id` is an `id` from `items.csv`.

## Cost model (for the app)

```
unit_cost(item):
  if type == raw:        return buy_price
  else:                  return sum( unit_cost(c) * qty for (c, qty) in components ) / output_qty
```

`items.csv` + `recipe_components.csv` form a DAG that resolves every crafted item down
to raw `buy_price` inputs. Set the raw prices → every crafted item's cost (and, against
`sell_price`, its margin) is computable. Recursion bottoms out at `type=raw`.

### Intermediate items (crafted, then used as ingredients)
- `tonic_herbs` → invigorating_tonic, ammonia_spirit, restoring_emulsion
- `healing_herbs` → healing_infusion, healing_drink, horse_medicine
- `calming_herbs` → antidote, stabilizing_solution, bee_medicine, dog_medicine
- `restoring_herbs` → strengthening_mixture, reparative_suspension
- `alcohol_flask` → sterile_bandage, ammonia_spirit, antidote
- `liver_extract` → ammonia_spirit
- `venom_extract` → antidote
- `coca_extract` → coca_gum

## Caveats

- All text was OCR'd from screenshots. Low-confidence reads to double-check against the
  source images:
  - `rams_head` (Баран-голова ×6) in `reparative_suspension`.
  - Shop page spells the stabilizing solution **Стабілізуючий розчин**; the crafting
    book spells it **Стабілізаційний розчин**. Treated as the same item
    (`stabilizing_solution`).
- `laudanum` and `resuscitation_syringe` appear in the crafting list with stats
  (level/time/exp/output) but their component pages were not captured →
  `components_complete=false`, no rows in `recipe_components.csv`. Fill these in when
  the missing screenshots are available.
- Shop-only items with no captured recipe: `analgesic_infusion` (Знеболювальні настої),
  `bandage_belt` (Бандажний пояс), `spray_syringe` (Розпилюючий шприц),
  `sedative_potassium` (Заспокійливий калій).
- Several shop products map onto crafted items by name (bandage, sterile_bandage,
  antidote, strengthening_mixture, restoring_emulsion, stabilizing_solution); their
  `sell_price` is recorded on the same row as the recipe.
