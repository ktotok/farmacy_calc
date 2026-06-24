"""CRUD for the recipe graph, with orphan + cycle validation.

A recipe edit is rejected (422) if it references a non-existent item or would
introduce a cycle (a product that, directly or transitively, requires itself).
"""
from collections import defaultdict
from typing import Dict, List, Set

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, select

from ..db import get_session
from ..models import Item, RecipeComponent
from ..schemas import RecipeComponentCreate, RecipeComponentRead, RecipeSet

router = APIRouter(prefix="/api/recipes", tags=["recipes"])


def _graph(session: Session) -> Dict[str, Set[str]]:
    """product_id -> set(component_id) for the whole current graph."""
    g: Dict[str, Set[str]] = defaultdict(set)
    for rc in session.exec(select(RecipeComponent)).all():
        g[rc.product_id].add(rc.component_id)
    return g


def _creates_cycle(graph: Dict[str, Set[str]], product_id: str) -> bool:
    """DFS from product_id over `graph`; True if product_id is reachable from
    itself (i.e. the graph contains a cycle through it)."""
    seen: Set[str] = set()
    stack = list(graph.get(product_id, ()))
    while stack:
        node = stack.pop()
        if node == product_id:
            return True
        if node in seen:
            continue
        seen.add(node)
        stack.extend(graph.get(node, ()))
    return False


def _require_item(session: Session, item_id: str):
    if not session.get(Item, item_id):
        raise HTTPException(422, f"Компонент '{item_id}' не існує")


@router.get("", response_model=List[RecipeComponentRead])
def list_recipes(session: Session = Depends(get_session)):
    return session.exec(select(RecipeComponent)).all()


@router.post("", response_model=RecipeComponentRead, status_code=201)
def add_component(payload: RecipeComponentCreate, session: Session = Depends(get_session)):
    _require_item(session, payload.product_id)
    _require_item(session, payload.component_id)
    if payload.product_id == payload.component_id:
        raise HTTPException(422, "Виріб не може бути власним компонентом")
    existing = session.get(RecipeComponent, (payload.product_id, payload.component_id))
    if existing:
        raise HTTPException(409, "Такий компонент уже є в рецепті")

    graph = _graph(session)
    graph[payload.product_id].add(payload.component_id)
    if _creates_cycle(graph, payload.product_id):
        raise HTTPException(422, "Цей компонент створив би цикл у рецептах")

    rc = RecipeComponent(**payload.model_dump())
    session.add(rc)
    session.commit()
    session.refresh(rc)
    return rc


@router.put("/{product_id}", response_model=List[RecipeComponentRead])
def set_recipe(product_id: str, payload: RecipeSet, session: Session = Depends(get_session)):
    """Replace the full component list of one product atomically."""
    _require_item(session, product_id)
    seen: Set[str] = set()
    for comp in payload.components:
        if comp.product_id != product_id:
            raise HTTPException(422, "product_id компонента не збігається з URL")
        if comp.component_id == product_id:
            raise HTTPException(422, "Виріб не може бути власним компонентом")
        if comp.component_id in seen:
            raise HTTPException(422, f"Повторюваний компонент '{comp.component_id}'")
        seen.add(comp.component_id)
        _require_item(session, comp.component_id)

    graph = _graph(session)
    graph[product_id] = set(seen)
    if _creates_cycle(graph, product_id):
        raise HTTPException(422, "Цей рецепт створив би цикл")

    for rc in session.exec(
        select(RecipeComponent).where(RecipeComponent.product_id == product_id)
    ).all():
        session.delete(rc)
    for comp in payload.components:
        session.add(RecipeComponent(**comp.model_dump()))
    session.commit()
    return session.exec(
        select(RecipeComponent).where(RecipeComponent.product_id == product_id)
    ).all()


@router.delete("/{product_id}/{component_id}", status_code=204)
def delete_component(product_id: str, component_id: str, session: Session = Depends(get_session)):
    rc = session.get(RecipeComponent, (product_id, component_id))
    if not rc:
        raise HTTPException(404, "Компонент рецепту не знайдено")
    session.delete(rc)
    session.commit()
