import { describe, expect, it } from "vitest";
import { availableComponents, filterByText } from "./RecipeEditor";
import type { Item } from "../types";

function item(id: string, type: Item["type"], name_uk: string = id): Item {
  return {
    id, name_uk, type, category: null, buy_price: null, craft_level: null,
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

describe("filterByText", () => {
  const items: Item[] = [
    item("opium", "raw", "Опіум"),
    item("distilled_water", "raw", "Дистильована вода"),
    item("herb_extract", "intermediate", "Екстракт трав"),
  ];

  it("returns all items when the query is empty", () => {
    expect(filterByText(items, "")).toHaveLength(3);
    expect(filterByText(items, "   ")).toHaveLength(3);
  });

  it("matches name_uk case-insensitively", () => {
    expect(filterByText(items, "опі").map((i) => i.id)).toEqual(["opium"]);
    expect(filterByText(items, "ОПІ").map((i) => i.id)).toEqual(["opium"]);
  });

  it("matches by id", () => {
    expect(filterByText(items, "herb_extract").map((i) => i.id)).toEqual(["herb_extract"]);
  });

  it("returns no items when nothing matches", () => {
    expect(filterByText(items, "xyz")).toHaveLength(0);
  });
});
