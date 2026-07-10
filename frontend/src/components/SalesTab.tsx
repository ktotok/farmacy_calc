import { useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api";
import type { Item, Sale } from "../types";
import { filterByText } from "./RecipeEditor";

const fmt = (n: number | null): string =>
  n == null || isNaN(n) ? "—" : "$" + n.toFixed(2);

const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// yyyy-mm-dd -> ISO at local noon (avoids midnight-boundary drift when bucketing).
const dateToISO = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0).toISOString();
};

interface Props {
  items: Item[];
  onRecorded: () => void;
  onDeleted: () => void;
  onError: (msg: string) => void;
}

export default function SalesTab({ items, onRecorded, onDeleted, onError }: Props) {
  const shopItems = useMemo(
    () =>
      items
        .filter((i) => i.type === "product" || i.sell_price != null)
        .sort((a, b) => a.name_uk.localeCompare(b.name_uk, "uk")),
    [items]
  );

  const [filter, setFilter] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [priceStr, setPriceStr] = useState("");
  const [dateStr, setDateStr] = useState(todayStr());
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Sale[]>([]);

  async function loadRecent() {
    try {
      setRecent(await api.getSales({ limit: 15 }));
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Не вдалося завантажити продажі");
    }
  }
  useEffect(() => { loadRecent(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const selected = selectedId ? items.find((i) => i.id === selectedId) ?? null : null;
  const filtered = filterByText(shopItems, filter);

  function select(item: Item) {
    setSelectedId(item.id);
    setPriceStr(item.sell_price != null ? String(item.sell_price) : "");
  }

  async function record() {
    if (!selectedId) return;
    setBusy(true);
    try {
      await api.recordSale({
        item_id: selectedId,
        quantity: qty,
        unit_price: priceStr === "" ? null : Number(priceStr),
        sold_at: dateToISO(dateStr),
      });
      setQty(1);
      onRecorded();
      loadRecent();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Не вдалося записати продаж");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("Видалити цей продаж?")) return;
    try {
      await api.deleteSale(id);
      onDeleted();
      loadRecent();
    } catch (e) {
      onError(e instanceof ApiError ? e.message : "Не вдалося видалити продаж");
    }
  }

  return (
    <section className="tab-panel">
      <p className="hint">
        Записуйте кожен продаж — ціна й собівартість фіксуються на момент продажу, тож
        зміна цін чи нові вироби не впливають на минулі звіти. Звіт за період — на вкладці «Зведення».
      </p>

      {/* ---- record a sale ---- */}
      <div className="sale-recorder">
        <input className="field search" type="search" placeholder="Пошук виробу…"
          value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: "100%" }} />
        <ul className="component-picker-list">
          {filtered.length === 0 && <li className="hint">Нічого не знайдено.</li>}
          {filtered.map((i) => (
            <li key={i.id} className={i.id === selectedId ? "selected" : ""} onClick={() => select(i)}>
              {i.name_uk}
              {i.sell_price != null && <span className="tag">{fmt(i.sell_price)}</span>}
            </li>
          ))}
        </ul>

        <div className="sale-fields">
          <div className="form-row">
            <label>Виріб</label>
            <span className="sale-selected">{selected ? selected.name_uk : "—"}</span>
          </div>
          <div className="form-row">
            <label>Кількість</label>
            <input className="field sale-qty" type="number" min="1" value={qty}
              onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
          </div>
          <div className="form-row">
            <label>Ціна / од ($)</label>
            <input className="field sale-price" type="number" min="0" step="0.01" placeholder="0.00"
              value={priceStr} onChange={(e) => setPriceStr(e.target.value)} />
          </div>
          <div className="form-row">
            <label>Дата</label>
            <input className="field" type="date" value={dateStr}
              onChange={(e) => setDateStr(e.target.value)} />
          </div>
          <button className="btn" disabled={!selectedId || busy} onClick={record}>Записати</button>
        </div>
      </div>

      {/* ---- recent sales ---- */}
      {recent.length > 0 && (
        <div className="recent-sales">
          <h3 className="subhead">Останні продажі</h3>
          <table className="ledger-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Товар</th>
                <th className="num">К-сть</th>
                <th className="num">Ціна / од</th>
                <th className="num">Виторг</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {recent.map((s) => (
                <tr key={s.id}>
                  <td>{new Date(s.sold_at).toLocaleDateString("uk-UA")}</td>
                  <td>{s.item_name}</td>
                  <td className="num">{s.quantity}</td>
                  <td className="num">{fmt(s.unit_price)}</td>
                  <td className="num">{fmt(s.unit_price * s.quantity)}</td>
                  <td className="num">
                    <button className="icon-btn" title="Видалити продаж" onClick={() => remove(s.id)}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
