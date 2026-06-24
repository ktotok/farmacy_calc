"""CRUD for items + price edits."""
from typing import List, Union

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Item, RecipeComponent
from ..schemas import ItemCreate, ItemRead, ItemUpdate, PriceUpdate

router = APIRouter(prefix="/api/items", tags=["items"])


@router.get("", response_model=List[ItemRead])
def list_items(session: Session = Depends(get_session)):
    return session.exec(select(Item)).all()


@router.get("/{item_id}", response_model=ItemRead)
def get_item(item_id: str, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Виріб не знайдено")
    return item


@router.post("", response_model=ItemRead, status_code=201)
def create_item(payload: ItemCreate, session: Session = Depends(get_session)):
    if session.get(Item, payload.id):
        raise HTTPException(409, f"Виріб з id '{payload.id}' вже існує")
    item = Item(**payload.model_dump())
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.put("/{item_id}", response_model=ItemRead)
def update_item(item_id: str, payload: ItemUpdate, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Виріб не знайдено")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(item_id: str, session: Session = Depends(get_session)):
    item = session.get(Item, item_id)
    if not item:
        raise HTTPException(404, "Виріб не знайдено")
    session.delete(item)  # ON DELETE CASCADE removes its recipe rows
    session.commit()


@router.put("/prices/batch")
def update_prices(
    payload: Union[PriceUpdate, List[PriceUpdate]],
    session: Session = Depends(get_session),
):
    """Apply one or many price edits. Mirrors the legacy /api/prices contract
    (used by the 'reset prices' action)."""
    updates = payload if isinstance(payload, list) else [payload]
    applied = 0
    for u in updates:
        item = session.get(Item, u.id)
        if not item:
            continue
        setattr(item, u.field, u.value)
        session.add(item)
        applied += 1
    session.commit()
    return {"ok": True, "applied": applied}
