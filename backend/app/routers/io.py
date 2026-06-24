"""CSV import / export so the spreadsheet / text-editor bulk-edit workflow
survives even though SQLite is now the source of truth."""
import csv
import io as _io
from typing import List

from fastapi import APIRouter, Body, Depends, HTTPException
from fastapi.responses import PlainTextResponse
from sqlmodel import Session, select

from ..db import get_session
from ..models import Item, ItemType, RecipeComponent

router = APIRouter(prefix="/api", tags=["import/export"])

ITEM_COLS = [
    "id", "name_uk", "category", "type", "buy_price", "craft_level",
    "craft_time", "craft_exp", "output_qty", "shop_section", "sell_price",
    "components_complete", "notes",
]
RECIPE_COLS = ["product_id", "component_id", "quantity"]


def _cell(v):
    if v is None:
        return ""
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, ItemType):
        return v.value
    return str(v)


def _csv_text(cols: List[str], rows: List[dict]) -> str:
    buf = _io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(cols)
    for r in rows:
        w.writerow([_cell(r.get(c)) for c in cols])
    return buf.getvalue()


@router.get("/export/items.csv", response_class=PlainTextResponse)
def export_items(session: Session = Depends(get_session)):
    items = session.exec(select(Item)).all()
    rows = [{c: getattr(i, c) for c in ITEM_COLS} for i in items]
    return PlainTextResponse(_csv_text(ITEM_COLS, rows), media_type="text/csv")


@router.get("/export/recipes.csv", response_class=PlainTextResponse)
def export_recipes(session: Session = Depends(get_session)):
    recs = session.exec(select(RecipeComponent)).all()
    rows = [{c: getattr(r, c) for c in RECIPE_COLS} for r in recs]
    return PlainTextResponse(_csv_text(RECIPE_COLS, rows), media_type="text/csv")


def _f(v):
    return None if v in (None, "") else float(v)


def _i(v):
    return None if v in (None, "") else int(v)


@router.post("/import/items")
def import_items(body: str = Body(..., media_type="text/plain"), session: Session = Depends(get_session)):
    """Replace ALL items from a CSV (same columns as export). Recipes are wiped
    first because items are their FK target; re-import recipes afterwards."""
    reader = csv.DictReader(_io.StringIO(body))
    if reader.fieldnames is None or "id" not in reader.fieldnames:
        raise HTTPException(422, "CSV має містити колонку 'id'")
    new_items = []
    seen = set()
    for row in reader:
        iid = (row.get("id") or "").strip()
        if not iid:
            continue
        if iid in seen:
            raise HTTPException(422, f"Повторюваний id '{iid}'")
        seen.add(iid)
        try:
            new_items.append(Item(
                id=iid,
                name_uk=(row.get("name_uk") or iid).strip(),
                category=row.get("category") or None,
                type=ItemType((row.get("type") or "raw").strip()),
                buy_price=_f(row.get("buy_price")),
                craft_level=_i(row.get("craft_level")),
                craft_time=row.get("craft_time") or None,
                craft_exp=_i(row.get("craft_exp")),
                output_qty=_i(row.get("output_qty")),
                shop_section=row.get("shop_section") or None,
                sell_price=_f(row.get("sell_price")),
                components_complete=str(row.get("components_complete") or "").strip().lower() == "true",
                notes=row.get("notes") or None,
            ))
        except (ValueError, KeyError) as e:
            raise HTTPException(422, f"Помилка в рядку id='{iid}': {e}")

    for rc in session.exec(select(RecipeComponent)).all():
        session.delete(rc)
    for it in session.exec(select(Item)).all():
        session.delete(it)
    session.add_all(new_items)
    session.commit()
    return {"ok": True, "items": len(new_items), "recipes_cleared": True}


@router.post("/import/recipes")
def import_recipes(body: str = Body(..., media_type="text/plain"), session: Session = Depends(get_session)):
    """Replace ALL recipe components from a CSV. Every referenced id must exist."""
    reader = csv.DictReader(_io.StringIO(body))
    if reader.fieldnames is None or "product_id" not in reader.fieldnames:
        raise HTTPException(422, "CSV має містити колонку 'product_id'")
    ids = {i.id for i in session.exec(select(Item)).all()}
    new_recs = []
    seen = set()
    for row in reader:
        pid = (row.get("product_id") or "").strip()
        cid = (row.get("component_id") or "").strip()
        if not pid or not cid:
            continue
        if pid not in ids:
            raise HTTPException(422, f"Виріб '{pid}' не існує")
        if cid not in ids:
            raise HTTPException(422, f"Компонент '{cid}' не існує")
        if (pid, cid) in seen:
            raise HTTPException(422, f"Повторюваний компонент {pid}/{cid}")
        seen.add((pid, cid))
        try:
            qty = int(row.get("quantity") or 0)
        except ValueError:
            raise HTTPException(422, f"Невірна кількість для {pid}/{cid}")
        if qty < 1:
            raise HTTPException(422, f"Кількість має бути >= 1 для {pid}/{cid}")
        new_recs.append(RecipeComponent(product_id=pid, component_id=cid, quantity=qty))

    for rc in session.exec(select(RecipeComponent)).all():
        session.delete(rc)
    session.add_all(new_recs)
    session.commit()
    return {"ok": True, "recipes": len(new_recs)}
