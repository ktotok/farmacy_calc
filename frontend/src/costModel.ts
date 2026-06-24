import type { Item, RecipeComponent } from "./types";

/* Cost model — direct port of the legacy app.js unitCost().
     unit_cost(raw)     = buy_price
     unit_cost(crafted) = Σ(unit_cost(component) * qty) / output_qty
   Recursive with a cycle guard; returns null when a price is unknown or a
   cycle is hit (rendered as "—"). */

export type ById = Record<string, Item>;
export type RecipeOf = Record<string, RecipeComponent[]>;

export function buildIndexes(items: Item[], recipes: RecipeComponent[]): {
  byId: ById;
  recipeOf: RecipeOf;
} {
  const byId: ById = Object.fromEntries(items.map((i) => [i.id, i]));
  const recipeOf: RecipeOf = {};
  recipes.forEach((r) => (recipeOf[r.product_id] ??= []).push(r));
  return { byId, recipeOf };
}

export function unitCost(
  id: string,
  byId: ById,
  recipeOf: RecipeOf,
  stack: Set<string> = new Set(),
): number | null {
  const it = byId[id];
  if (!it) return null;
  const comps = recipeOf[id];
  if (!comps || comps.length === 0) return it.buy_price; // raw / no recipe
  if (stack.has(id)) return null;
  stack.add(id);
  let sum = 0;
  for (const r of comps) {
    const c = unitCost(r.component_id, byId, recipeOf, stack);
    if (c == null) {
      stack.delete(id);
      return null;
    }
    sum += c * r.quantity;
  }
  stack.delete(id);
  const out = it.output_qty || 1;
  return sum / out;
}
