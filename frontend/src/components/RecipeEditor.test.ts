import { describe, expect, it } from "vitest";
import { availableComponents } from "./RecipeEditor";
import type { Item } from "../types";

function item(id: string, type: Item["type"]): Item {
  return {
    id, name_uk: id, type, category: null, buy_price: null, craft_level: null,
    craft_time: null, craft_exp: null, output_qty: null, shop_section: null,
    sell_price: null, components_complete: true, notes: null,
  };
}

describe("availableComponents", () => {
  const product = item("laudanum", "product");
  const items: Item[] = [
    product,
    item("opium", "raw"),
    item("distilled_water", "raw"),
    item("herb_extract", "intermediate"),
    item("bandage", "product"),
  ];

  it("excludes product-type items", () => {
    const available = availableComponents(items, product, []);
    expect(available.every((i) => i.type !== "product")).toBe(true);
    expect(available.map((i) => i.id)).not.toContain("bandage");
  });

  it("includes raw and intermediate items", () => {
    const available = availableComponents(items, product, []);
    expect(available.map((i) => i.id).sort()).toEqual(["distilled_water", "opium", "herb_extract"].sort());
  });

  it("excludes the item itself and already-added rows", () => {
    const available = availableComponents(items, product, [{ component_id: "opium", quantity: 1 }]);
    expect(available.map((i) => i.id)).not.toContain("laudanum");
    expect(available.map((i) => i.id)).not.toContain("opium");
  });
});
