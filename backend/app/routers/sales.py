"""Record + list actual sales (append-only ledger).

Each sale snapshots `unit_price` (charged) and `unit_cost` (production cost via
the parity cost model) so reports stay stable when items change or are deleted.

`sold_at` is normalized to canonical UTC ISO (millisecond precision, 'Z' suffix,
matching JS Date.toISOString()) so it sorts/filters correctly as a string.
"""
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session, select

from ..cost import all_unit_costs
from ..db import get_session
from ..models import Item, RecipeComponent, Sale
from ..schemas import SaleCreate, SaleRead

router = APIRouter(prefix="/api/sales", tags=["sales"])


def _canonical_iso(s: str) -> str:
    """ISO 8601 -> canonical UTC millis with 'Z' (matches Date.toISOString()).
    Raises ValueError on an unparseable string."""
    dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _iso_or_422(s: str, what: str) -> str:
    try:
        return _canonical_iso(s)
    except ValueError:
        raise HTTPException(422, f"Некоректна дата: {what}")


def _cost_snapshot(session: Session, item_id: str) -> Optional[float]:
    """Production cost of one item right now, via the same cost model the UI uses.
    Returns None when any input price is unknown (rendered '—')."""
    items = [i.model_dump() for i in session.exec(select(Item)).all()]
    recipes = [r.model_dump() for r in session.exec(select(RecipeComponent)).all()]
    return all_unit_costs(items, recipes).get(item_id)


@router.get("", response_model=List[SaleRead])
def list_sales(
    start: Optional[str] = Query(default=None, description="ISO 8601; keep sold_at >= start"),
    end: Optional[str] = Query(default=None, description="ISO 8601; keep sold_at < end (exclusive)"),
    limit: Optional[int] = Query(default=None, ge=1, description="return at most N, newest first"),
    session: Session = Depends(get_session),
):
    """List sales newest-first. Optional [start, end) date window (UTC instants)
    and a limit — omit all for the full ledger."""
    q = select(Sale)
    if start is not None:
        q = q.where(Sale.sold_at >= _iso_or_422(start, "start"))
    if end is not None:
        q = q.where(Sale.sold_at < _iso_or_422(end, "end"))
    q = q.order_by(Sale.sold_at.desc())
    if limit is not None:
        q = q.limit(limit)
    return session.exec(q).all()


@router.post("", response_model=SaleRead, status_code=201)
def create_sale(payload: SaleCreate, session: Session = Depends(get_session)):
    item = session.get(Item, payload.item_id)
    if not item:
        raise HTTPException(404, "Виріб не знайдено")
    unit_price = payload.unit_price if payload.unit_price is not None else item.sell_price
    if unit_price is None:
        raise HTTPException(422, "Вкажіть ціну продажу — у виробу немає ціни за замовчуванням")
    sold_at = _iso_or_422(payload.sold_at, "sold_at") if payload.sold_at \
        else _canonical_iso(datetime.now(timezone.utc).isoformat())
    sale = Sale(
        item_id=item.id,
        item_name=item.name_uk,
        quantity=payload.quantity,
        unit_price=unit_price,
        unit_cost=_cost_snapshot(session, item.id),
        sold_at=sold_at,
    )
    session.add(sale)
    session.commit()
    session.refresh(sale)
    return sale


@router.delete("/{sale_id}", status_code=204)
def delete_sale(sale_id: int, session: Session = Depends(get_session)):
    sale = session.get(Sale, sale_id)
    if not sale:
        raise HTTPException(404, "Продаж не знайдено")
    session.delete(sale)
    session.commit()
