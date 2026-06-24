import { useEffect, useMemo, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { buildIndexes, unitCost } from "./costModel";
import { SECTION_LABELS, SECTION_ORDER } from "./constants";
import type { Item, RecipeComponent } from "./types";
import ItemCard from "./components/ItemCard";
import ItemForm from "./components/ItemForm";
import RecipeEditor from "./components/RecipeEditor";

type Tab = "products" | "intermediate" | "raw" | "summary";
type SortKey = "name" | "cost" | "sell" | "profit" | "margin" | "batch";

const fmt = (n: number | null): string =>
  n == null || isNaN(n) ? "—" : "$" + n.toFixed(2);
const clsOf = (v: number | null) => (v == null ? "" : v >= 0 ? "profit-pos" : "profit-neg");

export default function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [recipes, setRecipes] = useState<RecipeComponent[]>([]);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState<Tab>("products");

  const [pSearch, setPSearch] = useState("");
  const [hideIncomplete, setHideIncomplete] = useState(false);
  const [iSearch, setISearch] = useState("");
  const [rSearch, setRSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: number }>({ key: "margin", dir: -1 });

  const [flashId, setFlashId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const [editItem, setEditItem] = useState<Item | null | undefined>(undefined); // undefined=closed, null=create
  const [recipeItem, setRecipeItem] = useState<Item | null>(null);
  const flashTimer = useRef<number>();

  const { byId, recipeOf } = useMemo(() => buildIndexes(items, recipes), [items, recipes]);
  const cost = (id: string) => unitCost(id, byId, recipeOf);

  async function load() {
    try {
      const d = await api.getData();
      setItems(d.items);
      setRecipes(d.recipes);
      setLoadError("");
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }
  useEffect(() => { load(); }, []);

  function notify(msg: string, err = false) {
    setToast({ msg, err });
    window.setTimeout(() => setToast(null), 2600);
  }

  function goToItem(id: string) {
    const it = byId[id];
    if (!it) return;
    const dest: Tab = it.type === "raw" ? "raw" : it.type === "intermediate" ? "intermediate" : "products";
    setTab(dest);
    if (dest === "raw") setRSearch("");
    if (dest === "intermediate") setISearch("");
    if (dest === "products") { setPSearch(""); setHideIncomplete(false); }
    setFlashId(id);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 1700);
    requestAnimationFrame(() => {
      const sel = dest === "raw"
        ? `#raw-table tr[data-item="${id}"]`
        : `.card[data-item="${id}"]`;
      document.querySelector(sel)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }

  // Optimistic price edit -> local state + persist.
  function savePrice(id: string, field: "buy_price" | "sell_price", value: number | null) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    api.savePrices([{ id, field, value }]).catch((e) => {
      notify(e instanceof ApiError ? e.message : "Не вдалося зберегти ціну", true);
      load();
    });
  }

  async function resetRawPrices() {
    if (!confirm("Скинути всі закупівельні ціни на 0?")) return;
    const updates = items.filter((i) => i.type === "raw")
      .map((i) => ({ id: i.id, field: "buy_price" as const, value: 0 }));
    setItems((prev) => prev.map((i) => (i.type === "raw" ? { ...i, buy_price: 0 } : i)));
    try { await api.savePrices(updates); notify("Ціни скинуто."); }
    catch { notify("Не вдалося скинути ціни", true); load(); }
  }

  async function exportCsv(table: "items" | "recipes") {
    const a = document.createElement("a");
    a.href = `/api/export/${table}.csv`;
    a.download = `${table}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function importCsv(table: "items" | "recipes", file: File) {
    const text = await file.text();
    try {
      if (table === "items") await api.importItems(text);
      else await api.importRecipes(text);
      notify(`Імпортовано ${table === "items" ? "вироби" : "рецепти"}.`);
      load();
    } catch (e) {
      notify(e instanceof ApiError ? e.message : "Помилка імпорту", true);
    }
  }

  if (loadError) {
    return (
      <div className="page">
        <p className="hint" style={{ color: "var(--red)" }}>
          Не вдалося завантажити дані: {loadError}. Переконайтесь, що бекенд запущено
          (<code>uvicorn app.main:app</code>).
        </p>
      </div>
    );
  }

  const products = items.filter((i) => i.type === "product");
  const intermediates = items.filter((i) => i.type === "intermediate");
  const raws = items.filter((i) => i.type === "raw");

  return (
    <div className="page">
      <header className="ledger-head">
        <div className="ornament">&#10070;</div>
        <h1>Аптека Роудс</h1>
        <p className="subtitle">Журнал виготовлення &amp; калькулятор прибутку</p>
        <div className="ornament">&#10070;</div>
      </header>

      <nav className="tabs">
        {([
          ["products", "Вироби"], ["intermediate", "Проміжні"],
          ["raw", "Сировина"], ["summary", "Зведення"],
        ] as [Tab, string][]).map(([key, label]) => (
          <button key={key} className={"tab" + (tab === key ? " active" : "")} onClick={() => setTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      <div className="toolbar">
        <button className="btn" onClick={() => setEditItem(null)}>+ Новий виріб</button>
        <span className="spacer" />
        <button className="btn ghost small" onClick={() => exportCsv("items")}>⭳ Експорт виробів</button>
        <button className="btn ghost small" onClick={() => exportCsv("recipes")}>⭳ Експорт рецептів</button>
        <label className="btn ghost small" style={{ cursor: "pointer" }}>
          ⭱ Імпорт виробів
          <input type="file" accept=".csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv("items", f); e.target.value = ""; }} />
        </label>
        <label className="btn ghost small" style={{ cursor: "pointer" }}>
          ⭱ Імпорт рецептів
          <input type="file" accept=".csv" hidden
            onChange={(e) => { const f = e.target.files?.[0]; if (f) importCsv("recipes", f); e.target.value = ""; }} />
        </label>
      </div>

      {tab === "products" && (
        <ProductsTab
          products={products} byId={byId} recipeOf={recipeOf} flashId={flashId}
          search={pSearch} setSearch={setPSearch}
          hideIncomplete={hideIncomplete} setHideIncomplete={setHideIncomplete}
          onGoto={goToItem} onSell={(id, v) => savePrice(id, "sell_price", v)}
          onEditItem={setEditItem} onEditRecipe={setRecipeItem}
        />
      )}

      {tab === "intermediate" && (
        <section className="tab-panel">
          <p className="hint">Напівфабрикати — проміжні вироби, що використовуються як компоненти інших виробів.</p>
          <div className="toolbar">
            <input className="field search" type="search" placeholder="Пошук напівфабрикату…"
              value={iSearch} onChange={(e) => setISearch(e.target.value)} />
          </div>
          <div className="cards">
            {intermediates
              .filter((p) => !iSearch || p.name_uk.toLowerCase().includes(iSearch.toLowerCase()) || p.id.includes(iSearch))
              .map((p) => (
                <ItemCard key={p.id} item={p} byId={byId} recipeOf={recipeOf} flashId={flashId}
                  showSell={false} onGoto={goToItem} onSell={() => {}}
                  onEditItem={setEditItem} onEditRecipe={setRecipeItem} />
              ))}
          </div>
        </section>
      )}

      {tab === "raw" && (
        <section className="tab-panel">
          <p className="hint">Вкажіть закупівельну ціну за одиницю сировини. Значення зберігаються у базі даних.</p>
          <div className="toolbar">
            <input className="field search" type="search" placeholder="Пошук сировини…"
              value={rSearch} onChange={(e) => setRSearch(e.target.value)} />
            <button className="btn ghost" onClick={resetRawPrices}>Скинути ціни</button>
          </div>
          <table className="ledger-table" id="raw-table">
            <thead><tr><th>Сировина</th><th className="num">Ціна за од. ($)</th></tr></thead>
            <tbody>
              {raws
                .filter((i) => !rSearch || i.name_uk.toLowerCase().includes(rSearch.toLowerCase()) || i.id.includes(rSearch))
                .sort((a, b) => a.name_uk.localeCompare(b.name_uk, "uk"))
                .map((i) => (
                  <tr key={i.id} data-item={i.id} className={flashId === i.id ? "flash" : ""}>
                    <td>{i.name_uk} {i.notes && <span className="tag" title={i.notes}>＊</span>}</td>
                    <td className="num">
                      <input type="number" min="0" step="0.01" className="field price-input"
                        value={i.buy_price ?? ""}
                        onChange={(e) => savePrice(i.id, "buy_price", e.target.value === "" ? null : Number(e.target.value))} />
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === "summary" && (
        <SummaryTab items={items} cost={cost} sort={sort} setSort={setSort} />
      )}

      <footer className="ledger-foot">
        {products.length} виробів · {intermediates.length} напівфабрикатів · {raws.length} видів сировини · дані з SQLite
      </footer>

      {editItem !== undefined && (
        <ItemForm item={editItem} onClose={() => setEditItem(undefined)}
          onSaved={() => { setEditItem(undefined); notify("Збережено."); load(); }}
          onDeleted={() => { setEditItem(undefined); notify("Видалено."); load(); }} />
      )}
      {recipeItem && (
        <RecipeEditor item={recipeItem} items={items} recipeOf={recipeOf}
          onClose={() => setRecipeItem(null)}
          onSaved={() => { setRecipeItem(null); notify("Рецепт збережено."); load(); }} />
      )}

      {toast && <div className={"toast" + (toast.err ? " err" : "")}>{toast.msg}</div>}
    </div>
  );
}

/* ---- Products tab (grouped by shop_section) ---- */
function ProductsTab(props: {
  products: Item[]; byId: ReturnType<typeof buildIndexes>["byId"];
  recipeOf: ReturnType<typeof buildIndexes>["recipeOf"]; flashId: string | null;
  search: string; setSearch: (s: string) => void;
  hideIncomplete: boolean; setHideIncomplete: (b: boolean) => void;
  onGoto: (id: string) => void; onSell: (id: string, v: number | null) => void;
  onEditItem: (i: Item) => void; onEditRecipe: (i: Item) => void;
}) {
  const { products, search, hideIncomplete } = props;
  const q = search.trim().toLowerCase();
  const list = products
    .filter((p) => !q || p.name_uk.toLowerCase().includes(q) || p.id.includes(q))
    .filter((p) => !hideIncomplete || p.components_complete);

  const groups: Record<string, Item[]> = {};
  list.forEach((p) => (groups[p.shop_section || "__other"] ??= []).push(p));
  const keys = SECTION_ORDER.filter((k) => groups[k])
    .concat(Object.keys(groups).filter((k) => !SECTION_ORDER.includes(k)));

  return (
    <section className="tab-panel">
      <p className="hint">Готові вироби, згруповані за розділом крамниці. Натисніть компонент рецепту, щоб перейти.</p>
      <div className="toolbar">
        <input className="field search" type="search" placeholder="Пошук виробу…"
          value={search} onChange={(e) => props.setSearch(e.target.value)} />
        <label className="check">
          <input type="checkbox" checked={hideIncomplete} onChange={(e) => props.setHideIncomplete(e.target.checked)} />
          приховати неповні рецепти
        </label>
      </div>
      {keys.length === 0 && <p className="hint">Нічого не знайдено.</p>}
      {keys.map((key) => (
        <details className="group" key={key} open>
          <summary>{SECTION_LABELS[key] || key}<span className="count">({groups[key].length})</span></summary>
          <div className="cards">
            {groups[key].map((p) => (
              <ItemCard key={p.id} item={p} byId={props.byId} recipeOf={props.recipeOf} flashId={props.flashId}
                showSell onGoto={props.onGoto} onSell={props.onSell}
                onEditItem={props.onEditItem} onEditRecipe={props.onEditRecipe} />
            ))}
          </div>
        </details>
      ))}
    </section>
  );
}

/* ---- Summary tab (sortable) ---- */
function SummaryTab(props: {
  items: Item[]; cost: (id: string) => number | null;
  sort: { key: SortKey; dir: number }; setSort: (s: { key: SortKey; dir: number }) => void;
}) {
  const { items, cost, sort, setSort } = props;
  const rows = items
    .filter((p) => (p.type === "product" || p.type === "intermediate") && p.components_complete)
    .map((p) => {
      const out = p.output_qty || 1;
      const c = cost(p.id);
      const sell = p.sell_price;
      const profit = c != null && sell != null ? sell - c : null;
      const margin = profit != null && sell ? (profit / sell) * 100 : null;
      return { name: p.name_uk, cost: c, sell, profit, margin, batch: profit != null ? profit * out : null };
    });

  rows.sort((a, b) => {
    if (sort.key === "name") return a.name.localeCompare(b.name, "uk") * sort.dir;
    const av = a[sort.key] ?? -Infinity, bv = b[sort.key] ?? -Infinity;
    return ((av as number) - (bv as number)) * sort.dir;
  });

  const th = (key: SortKey, label: string, num = true) => (
    <th className={num ? "num" : ""} data-sort={key}
      onClick={() => setSort({ key, dir: sort.key === key ? -sort.dir : (key === "name" ? 1 : -1) })}>
      {label}
    </th>
  );

  return (
    <section className="tab-panel">
      <p className="hint">Собівартість, ціна продажу та маржа по всіх виробах. Натисніть заголовок для сортування.</p>
      <table className="ledger-table sortable">
        <thead>
          <tr>
            {th("name", "Виріб", false)}
            {th("cost", "Собівартість/од.")}
            {th("sell", "Продаж/од.")}
            {th("profit", "Прибуток/од.")}
            {th("margin", "Маржа %")}
            {th("batch", "Прибуток/партія")}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>{r.name}</td>
              <td className="num">{fmt(r.cost)}</td>
              <td className="num">{fmt(r.sell)}</td>
              <td className={"num " + clsOf(r.profit)}>{fmt(r.profit)}</td>
              <td className={"num " + clsOf(r.margin)}>{r.margin != null ? r.margin.toFixed(1) + "%" : "—"}</td>
              <td className={"num " + clsOf(r.batch)}>{fmt(r.batch)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
