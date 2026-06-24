"""GET /api/data — the read snapshot the frontend boots from.

Returns {items, recipes} as typed JSON (numbers as numbers, booleans as
booleans). The React client and the cost model consume this directly.
"""
from fastapi import APIRouter, Depends
from sqlmodel import Session, select

from ..db import get_session
from ..models import Item, RecipeComponent
from ..schemas import DataResponse

router = APIRouter(prefix="/api", tags=["data"])


@router.get("/data", response_model=DataResponse)
def get_data(session: Session = Depends(get_session)):
    items = session.exec(select(Item)).all()
    recipes = session.exec(select(RecipeComponent)).all()
    return {"items": items, "recipes": recipes}
