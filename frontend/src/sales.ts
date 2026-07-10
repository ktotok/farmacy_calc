// Pure sales aggregation — all date/money logic lives here so it can be unit
// tested (see sales.test.ts), keeping SalesTab a thin render layer.
// Profit convention matches ItemCard/SummaryTab: profit = revenue - cost,
// margin% = profit / revenue * 100. An unknown unit_cost poisons the group's
// cost/profit to null (rendered "—"), same as the cost model.
import type { Sale } from "./types";

export type Period = "day" | "week" | "month";

export interface Bounds {
  start: Date; // inclusive
  end: Date;   // exclusive
}

/** Calendar bounds in LOCAL time. Week starts Monday; month is the calendar month.
 *  Converted to UTC instants (toISOString) and passed to GET /api/sales as the
 *  [start, end) window, so the server returns only the period's sales. */
export function periodBounds(period: Period, now: Date): Bounds {
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  if (period === "day") {
    return { start: new Date(y, m, d), end: new Date(y, m, d + 1) };
  }
  if (period === "week") {
    const mondayOffset = (now.getDay() + 6) % 7; // Mon=0, …, Sun=6
    return { start: new Date(y, m, d - mondayOffset), end: new Date(y, m, d - mondayOffset + 7) };
  }
  return { start: new Date(y, m, 1), end: new Date(y, m + 1, 1) };
}

export interface AggRow {
  item_id: string | null;
  item_name: string;
  qty: number;
  revenue: number;
  cost: number | null;   // null if any sale in the group has an unknown unit_cost
  profit: number | null;
  margin: number | null;
}

export interface Totals {
  qty: number;
  revenue: number;
  cost: number | null;
  profit: number | null;
  margin: number | null;
}

function withProfit<T extends { revenue: number; cost: number | null }>(r: T): T & { profit: number | null; margin: number | null } {
  const profit = r.cost == null ? null : r.revenue - r.cost;
  const margin = profit != null && r.revenue ? (profit / r.revenue) * 100 : null;
  return { ...r, profit, margin };
}

/** Group sales by item (item_id, falling back to snapshot name for deleted items),
 *  sorted by revenue desc, plus a grand-total. */
export function aggregateByItem(sales: Sale[]): { rows: AggRow[]; totals: Totals } {
  const map = new Map<string, AggRow>();
  for (const s of sales) {
    const key = s.item_id ?? `deleted:${s.item_name}`;
    let row = map.get(key);
    if (!row) {
      row = { item_id: s.item_id, item_name: s.item_name, qty: 0, revenue: 0, cost: 0, profit: null, margin: null };
      map.set(key, row);
    }
    row.qty += s.quantity;
    row.revenue += s.unit_price * s.quantity;
    if (s.unit_cost == null) row.cost = null;          // unknown cost poisons the group
    else if (row.cost != null) row.cost += s.unit_cost * s.quantity;
  }

  const rows = [...map.values()].map(withProfit).sort((a, b) => b.revenue - a.revenue);

  let qty = 0, revenue = 0, cost: number | null = 0;
  for (const r of rows) {
    qty += r.qty;
    revenue += r.revenue;
    if (r.cost == null) cost = null;
    else if (cost != null) cost += r.cost;
  }
  const totals = withProfit({ qty, revenue, cost });
  return { rows, totals };
}
