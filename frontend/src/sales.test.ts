import { describe, expect, it } from "vitest";
import { aggregateByItem, periodBounds } from "./sales";
import type { Sale } from "./types";

// sold_at at a given LOCAL wall-clock time, serialized as ISO (instant preserved).
// `in` checks keep explicit null overrides (item_id/unit_cost) from being coerced.
function saleAt(local: Date, over: Partial<Sale> = {}): Sale {
  return {
    id: over.id ?? 1,
    item_id: "item_id" in over ? (over.item_id ?? null) : "antidote",
    item_name: over.item_name ?? "Протиотрута",
    quantity: over.quantity ?? 1,
    unit_price: over.unit_price ?? 5,
    unit_cost: "unit_cost" in over ? (over.unit_cost ?? null) : 2,
    sold_at: local.toISOString(),
    created_at: local.toISOString(),
  };
}

describe("periodBounds", () => {
  it("day = local calendar day", () => {
    const now = new Date(2026, 6, 10, 15, 30); // 10 Jul 2026, 15:30 local
    const { start, end } = periodBounds("day", now);
    expect(start).toEqual(new Date(2026, 6, 10, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 6, 11, 0, 0, 0));
  });

  it("week starts Monday and spans 7 days, containing now", () => {
    const now = new Date(2026, 6, 10, 9, 0); // whatever weekday this is
    const { start, end } = periodBounds("week", now);
    expect(start.getDay()).toBe(1); // Monday
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 3600 * 1000);
    expect(now.getTime()).toBeGreaterThanOrEqual(start.getTime());
    expect(now.getTime()).toBeLessThan(end.getTime());
    expect(start.getHours()).toBe(0);
  });

  it("Sunday belongs to the week that started the previous Monday", () => {
    const sunday = new Date(2026, 6, 12, 20, 0); // 12 Jul 2026 is a Sunday
    expect(sunday.getDay()).toBe(0);
    const { start, end } = periodBounds("week", sunday);
    expect(start).toEqual(new Date(2026, 6, 6, 0, 0, 0)); // Mon 6 Jul
    expect(end).toEqual(new Date(2026, 6, 13, 0, 0, 0));  // Mon 13 Jul (exclusive)
  });

  it("month = calendar month", () => {
    const now = new Date(2026, 6, 10, 9, 0);
    const { start, end } = periodBounds("month", now);
    expect(start).toEqual(new Date(2026, 6, 1, 0, 0, 0));
    expect(end).toEqual(new Date(2026, 7, 1, 0, 0, 0));
  });
});

describe("aggregateByItem", () => {
  it("sums quantity, revenue and cost per item and computes profit/margin", () => {
    const now = new Date(2026, 6, 10, 12, 0);
    const { rows, totals } = aggregateByItem([
      saleAt(now, { id: 1, item_id: "a", item_name: "A", quantity: 3, unit_price: 5, unit_cost: 2 }),
      saleAt(now, { id: 2, item_id: "a", item_name: "A", quantity: 2, unit_price: 5, unit_cost: 2 }),
      saleAt(now, { id: 3, item_id: "b", item_name: "B", quantity: 1, unit_price: 10, unit_cost: 4 }),
    ]);
    const a = rows.find((r) => r.item_id === "a")!;
    expect(a.qty).toBe(5);
    expect(a.revenue).toBe(25);
    expect(a.cost).toBe(10);
    expect(a.profit).toBe(15);
    expect(a.margin).toBeCloseTo(60, 9);
    // sorted by revenue desc: A (25) before B (10)
    expect(rows.map((r) => r.item_id)).toEqual(["a", "b"]);
    expect(totals.qty).toBe(6);
    expect(totals.revenue).toBe(35);
    expect(totals.cost).toBe(14);
    expect(totals.profit).toBe(21);
  });

  it("null unit_cost poisons cost/profit for the item and the totals", () => {
    const now = new Date(2026, 6, 10, 12, 0);
    const { rows, totals } = aggregateByItem([
      saleAt(now, { id: 1, item_id: "a", quantity: 2, unit_price: 5, unit_cost: null }),
      saleAt(now, { id: 2, item_id: "a", quantity: 1, unit_price: 5, unit_cost: 2 }),
    ]);
    const a = rows.find((r) => r.item_id === "a")!;
    expect(a.revenue).toBe(15);
    expect(a.cost).toBeNull();
    expect(a.profit).toBeNull();
    expect(a.margin).toBeNull();
    expect(totals.cost).toBeNull();
    expect(totals.profit).toBeNull();
  });

  it("groups deleted items (null item_id) by their snapshot name", () => {
    const now = new Date(2026, 6, 10, 12, 0);
    const { rows } = aggregateByItem([
      saleAt(now, { id: 1, item_id: null, item_name: "Старий виріб", quantity: 1, unit_price: 4, unit_cost: 1 }),
      saleAt(now, { id: 2, item_id: null, item_name: "Старий виріб", quantity: 2, unit_price: 4, unit_cost: 1 }),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0].item_name).toBe("Старий виріб");
    expect(rows[0].qty).toBe(3);
  });
});
