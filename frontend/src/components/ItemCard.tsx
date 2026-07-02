import type { ById, RecipeOf } from "../costModel";
import { unitCost } from "../costModel";
import { SECTION_LABELS } from "../constants";
import type { Item } from "../types";

const fmt = (n: number | null): string =>
  n == null || isNaN(n) ? "—" : "$" + n.toFixed(2);

const cls = (v: number | null) =>
  v == null ? "" : v >= 0 ? "profit-pos" : "profit-neg";

interface Props {
  item: Item;
  byId: ById;
  recipeOf: RecipeOf;
  flashId: string | null;
  showSell: boolean;
  onGoto: (id: string) => void;
  onSell: (id: string, value: number | null) => void;
  onEditItem: (item: Item) => void;
  onEditRecipe: (item: Item) => void;
}

export default function ItemCard({
  item, byId, recipeOf, flashId, showSell, onGoto, onSell, onEditItem, onEditRecipe,
}: Props) {
  const complete = item.components_complete;
  const cost = complete ? unitCost(item.id, byId, recipeOf) : null;
  const out = item.output_qty || 1;
  const sell = item.sell_price;
  const profit = cost != null && sell != null ? sell - cost : null;
  const margin = profit != null && sell ? (profit / sell) * 100 : null;
  const comps = recipeOf[item.id] || [];

  return (
    <div
      className={"card" + (complete ? "" : " incomplete") + (flashId === item.id ? " flash" : "")}
      data-item={item.id}
    >
      <div className="card-head">
        <h3>{item.name_uk}</h3>
        <div className="card-actions">
          <button className="icon-btn" title="Редагувати рецепт" onClick={() => onEditRecipe(item)}>рецепт</button>
          <button className="icon-btn" title="Редагувати виріб" onClick={() => onEditItem(item)}>✎</button>
        </div>
      </div>
      <div className="meta">
        рів. {item.craft_level ?? "—"} · {item.craft_time ?? "—"} · {item.craft_exp ?? "—"} XP · вихід ×{out}
        {item.type === "intermediate" && <span className="badge lvl">напівфабрикат</span>}
        {!complete && <span className="badge">рецепт неповний</span>}
        {item.shop_section && <span className="badge lvl">{SECTION_LABELS[item.shop_section] || item.shop_section}</span>}
      </div>

      {comps.length ? (
        <ul className="recipe">
          {comps.map((r) => {
            const c = byId[r.component_id];
            const craft = !!(recipeOf[r.component_id]?.length);
            const cuc = unitCost(r.component_id, byId, recipeOf);
            return (
              <li key={r.component_id}>
                <span
                  className={"iname " + (craft ? "craft" : "rawlink")}
                  title={craft ? "напівфабрикат — натисніть, щоб перейти" : "сировина — натисніть, щоб задати ціну"}
                  onClick={() => onGoto(r.component_id)}
                >
                  {c ? c.name_uk : r.component_id}
                  <span className={"tag" + (craft ? "" : " raw")}>{craft ? "(виріб)" : "(сировина)"}</span>
                </span>
                <span className="qty">×{r.quantity}</span>
                <span className="icost">{cuc != null ? fmt(cuc * r.quantity) : "—"}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="hint" style={{ margin: "6px 0 12px" }}>Компоненти невідомі.</p>
      )}

      <div className="calc">
        <div className="calc-row"><span className="lbl">Собівартість / од.</span><span className="val">{fmt(cost)}</span></div>
        <div className="calc-row"><span className="lbl">Собівартість / партія (×{out})</span><span className="val">{cost != null ? fmt(cost * out) : "—"}</span></div>
        {showSell && (
          <>
            <div className="calc-row">
              <span className="lbl">Ціна продажу / од.</span>
              <input
                type="number" min="0" step="0.01" className="field price-input"
                value={sell ?? ""}
                placeholder="0.00"
                onChange={(e) => onSell(item.id, e.target.value === "" ? null : Number(e.target.value))}
              />
            </div>
            <div className="calc-row"><span className="lbl">Прибуток / од.</span><span className={"val " + cls(profit)}>{profit != null ? fmt(profit) : "—"}</span></div>
            <div className="calc-row"><span className="lbl">Маржа</span><span className={"val " + cls(margin)}>{margin != null ? margin.toFixed(1) + "%" : "—"}</span></div>
            <div className="calc-row"><span className="lbl">Прибуток / партія</span><span className={"val " + cls(profit)}>{profit != null ? fmt(profit * out) : "—"}</span></div>
          </>
        )}
      </div>
    </div>
  );
}
