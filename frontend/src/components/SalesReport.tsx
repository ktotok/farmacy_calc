import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import { PERIOD_LABELS } from "../constants";
import { aggregateByItem, periodBounds, type Period } from "../sales";
import type { Sale } from "../types";

const fmt = (n: number | null): string =>
  n == null || isNaN(n) ? "—" : "$" + n.toFixed(2);
const cls = (v: number | null) =>
  v == null ? "" : v >= 0 ? "profit-pos" : "profit-neg";

interface Props {
  onError: (msg: string) => void;
}

// Зведення tab: day/week/month report of sold products. Fetches the period's
// sales server-side ([start, end) UTC window computed from local calendar
// bounds) and aggregates them by item. Read-only — recording lives on Продажі.
export default function SalesReport({ onError }: Props) {
  const [period, setPeriod] = useState<Period>("day");
  const [sales, setSales] = useState<Sale[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const b = periodBounds(period, new Date());
        const data = await api.getSales({ start: b.start.toISOString(), end: b.end.toISOString() });
        if (alive) setSales(data);
      } catch (e) {
        if (alive) onError(e instanceof ApiError ? e.message : "Не вдалося завантажити звіт");
      }
    })();
    return () => { alive = false; };
  }, [period]); // eslint-disable-line react-hooks/exhaustive-deps

  const { rows, totals } = useMemo(() => aggregateByItem(sales), [sales]);

  return (
    <section className="tab-panel">
      <p className="hint">
        Звіт про продані вироби за період. Виторг, собівартість і прибуток зафіксовані
        на момент кожного продажу. Записати новий продаж — на вкладці «Продажі».
      </p>

      <div className="period-toggle">
        {(["day", "week", "month"] as Period[]).map((p) => (
          <button key={p} className={"btn small" + (period === p ? "" : " ghost")}
            onClick={() => setPeriod(p)}>
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="hint">Продажів за цей період немає.</p>
      ) : (
        <table className="ledger-table">
          <thead>
            <tr>
              <th>Товар</th>
              <th className="num">К-сть</th>
              <th className="num">Виторг</th>
              <th className="num">Собівартість</th>
              <th className="num">Прибуток</th>
              <th className="num">Маржа</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.item_id ?? `deleted:${r.item_name}`}>
                <td>{r.item_name}</td>
                <td className="num">{r.qty}</td>
                <td className="num">{fmt(r.revenue)}</td>
                <td className="num">{fmt(r.cost)}</td>
                <td className={"num " + cls(r.profit)}>{fmt(r.profit)}</td>
                <td className={"num " + cls(r.margin)}>{r.margin != null ? r.margin.toFixed(1) + "%" : "—"}</td>
              </tr>
            ))}
            <tr className="sale-total">
              <td>Разом</td>
              <td className="num">{totals.qty}</td>
              <td className="num">{fmt(totals.revenue)}</td>
              <td className="num">{fmt(totals.cost)}</td>
              <td className={"num " + cls(totals.profit)}>{fmt(totals.profit)}</td>
              <td className={"num " + cls(totals.margin)}>{totals.margin != null ? totals.margin.toFixed(1) + "%" : "—"}</td>
            </tr>
          </tbody>
        </table>
      )}
    </section>
  );
}
