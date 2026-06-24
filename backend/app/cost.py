"""Server-side port of app.js unitCost(), used for the cost-model parity test
and available for any future server-side computation.

    unit_cost(raw)     = buy_price
    unit_cost(crafted) = Σ(unit_cost(component) * qty) / output_qty

Recursive with a cycle guard; returns None when any input price is unknown or a
cycle is hit (matching the legacy JS, which renders such costs as "—").
"""
from typing import Dict, List, Optional


def build_recipe_map(recipes) -> Dict[str, list]:
    out: Dict[str, list] = {}
    for r in recipes:
        out.setdefault(r["product_id"], []).append(r)
    return out


def unit_cost(item_id, by_id, recipe_of, stack=None) -> Optional[float]:
    if stack is None:
        stack = set()
    it = by_id.get(item_id)
    if it is None:
        return None
    comps = recipe_of.get(item_id)
    if not comps:  # raw / no recipe
        return it.get("buy_price")
    if item_id in stack:
        return None
    stack.add(item_id)
    total = 0.0
    for r in comps:
        c = unit_cost(r["component_id"], by_id, recipe_of, stack)
        if c is None:
            stack.discard(item_id)
            return None
        total += c * r["quantity"]
    stack.discard(item_id)
    out = it.get("output_qty") or 1
    return total / out


def all_unit_costs(items: List[dict], recipes: List[dict]) -> Dict[str, Optional[float]]:
    by_id = {i["id"]: i for i in items}
    recipe_of = build_recipe_map(recipes)
    return {i["id"]: unit_cost(i["id"], by_id, recipe_of) for i in items}
