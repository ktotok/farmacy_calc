import { useMemo, useState } from "react";
import { api, ApiError } from "../api";
import type { RecipeOf } from "../costModel";
import type { Item, RecipeComponent } from "../types";

interface Props {
  item: Item;
  items: Item[];
  recipeOf: RecipeOf;
  onClose: () => void;
  onSaved: () => void;
}

type Row = { component_id: string; quantity: number };

// Exported for unit testing — components must be raw/intermediate, never product.
export function availableComponents(items: Item[], item: Item, rows: Row[]): Item[] {
  return items
    .filter((i) => i.type !== "product" && i.id !== item.id && !rows.some((r) => r.component_id === i.id))
    .sort((a, b) => a.name_uk.localeCompare(b.name_uk, "uk"));
}

export default function RecipeEditor({ item, items, recipeOf, onClose, onSaved }: Props) {
  const initial: Row[] = (recipeOf[item.id] || []).map((r) => ({
    component_id: r.component_id,
    quantity: r.quantity,
  }));
  const [rows, setRows] = useState<Row[]>(initial);
  const [addId, setAddId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const nameOf = useMemo(() => {
    const m: Record<string, string> = {};
    items.forEach((i) => (m[i.id] = i.name_uk));
    return m;
  }, [items]);

  const available = availableComponents(items, item, rows);

  function addRow() {
    if (!addId) return;
    setRows((r) => [...r, { component_id: addId, quantity: 1 }]);
    setAddId("");
  }

  async function save() {
    setError("");
    setBusy(true);
    try {
      const components: RecipeComponent[] = rows.map((r) => ({
        product_id: item.id,
        component_id: r.component_id,
        quantity: r.quantity,
      }));
      await api.setRecipe(item.id, components);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Рецепт: {item.name_uk}</h2>
        <ul className="recipe-edit">
          {rows.length === 0 && <li><span className="comp-name hint">Компонентів ще немає.</span></li>}
          {rows.map((r, idx) => (
            <li key={r.component_id}>
              <span className="comp-name">{nameOf[r.component_id] ?? r.component_id}</span>
              <input
                type="number" min="1" className="field qty-input" value={r.quantity}
                onChange={(e) =>
                  setRows((rs) => rs.map((x, i) => i === idx ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x))
                }
              />
              <button className="icon-btn" title="Прибрати"
                onClick={() => setRows((rs) => rs.filter((_, i) => i !== idx))}>✕</button>
            </li>
          ))}
        </ul>
        <div className="toolbar" style={{ marginTop: 12 }}>
          <select className="field" style={{ flex: 1 }} value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">— додати компонент —</option>
            {available.map((i) => <option key={i.id} value={i.id}>{i.name_uk}</option>)}
          </select>
          <button className="btn ghost" onClick={addRow} disabled={!addId}>Додати</button>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button className="btn ghost" disabled={busy} onClick={onClose}>Скасувати</button>
          <button className="btn" disabled={busy} onClick={save}>Зберегти рецепт</button>
        </div>
      </div>
    </div>
  );
}
