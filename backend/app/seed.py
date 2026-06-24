"""CSV -> SQLite migration / seed.

Reads data/items.csv and data/recipe_components.csv (header located by its
first-column name, like the old server) and populates the database. Any recipe
component referenced but missing from items.csv is auto-created as a raw item
with a NULL buy_price -- this both keeps foreign-key integrity and preserves the
legacy behaviour (its cost stays unknown, so dependent products show no cost).
"""
import csv
import os

from sqlmodel import Session, select

from .db import DATA_DIR, engine, init_db
from .models import Item, ItemType, RecipeComponent

ITEMS_CSV = os.path.join(DATA_DIR, "items.csv")
RECIPES_CSV = os.path.join(DATA_DIR, "recipe_components.csv")


def _read_rows(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.reader(f))


def _find_header(rows, key):
    for i, r in enumerate(rows):
        if r and r[0].strip() == key:
            return i
    return 0


def _parse_table(path, key):
    rows = _read_rows(path)
    h = _find_header(rows, key)
    header = [c.strip() for c in rows[h]]
    out = []
    for i, r in enumerate(rows):
        if i == h or not r or all(c.strip() == "" for c in r):
            continue
        r = r + [""] * (len(header) - len(r))
        out.append({header[j]: (r[j] if r[j] != "" else None) for j in range(len(header))})
    return out


def _f(v):
    return None if v is None or v == "" else float(v)


def _i(v):
    return None if v is None or v == "" else int(v)


def _b(v):
    return str(v).strip().lower() == "true"


def _item_from_row(row):
    return Item(
        id=row["id"],
        name_uk=row.get("name_uk") or row["id"],
        category=row.get("category"),
        type=ItemType(row["type"]),
        buy_price=_f(row.get("buy_price")),
        craft_level=_i(row.get("craft_level")),
        craft_time=row.get("craft_time"),
        craft_exp=_i(row.get("craft_exp")),
        output_qty=_i(row.get("output_qty")),
        shop_section=row.get("shop_section"),
        sell_price=_f(row.get("sell_price")),
        components_complete=_b(row.get("components_complete")),
        notes=row.get("notes"),
    )


def seed(session: Session) -> dict:
    """Populate an empty DB from the CSVs. Returns counts. Idempotent: skips if
    items already exist."""
    if session.exec(select(Item)).first() is not None:
        return {"skipped": True}

    item_rows = _parse_table(ITEMS_CSV, "id")
    recipe_rows = _parse_table(RECIPES_CSV, "product_id")

    items = {row["id"]: _item_from_row(row) for row in item_rows}

    # Auto-create any referenced-but-missing component/product as a raw item.
    referenced = set()
    for rc in recipe_rows:
        referenced.add(rc["product_id"])
        referenced.add(rc["component_id"])
    auto_created = []
    for ref in sorted(referenced):
        if ref not in items:
            items[ref] = Item(
                id=ref,
                name_uk=ref,
                category="raw",
                type=ItemType.raw,
                buy_price=None,
                notes="auto-created: referenced by a recipe but missing from items.csv",
            )
            auto_created.append(ref)

    session.add_all(items.values())
    session.flush()

    recipes = [
        RecipeComponent(
            product_id=rc["product_id"],
            component_id=rc["component_id"],
            quantity=int(rc["quantity"]),
        )
        for rc in recipe_rows
    ]
    session.add_all(recipes)
    session.commit()

    return {
        "items": len(items),
        "recipes": len(recipes),
        "auto_created": auto_created,
    }


def main():
    init_db()
    with Session(engine) as session:
        result = seed(session)
    print("Seed result:", result)


if __name__ == "__main__":
    main()
