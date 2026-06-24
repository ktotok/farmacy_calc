import { useState } from "react";
import { api, ApiError, TYPES } from "../api";
import { ITEM_TYPE_LABELS } from "../constants";
import type { Item, ItemType } from "../types";

interface Props {
  item: Item | null; // null = create
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
}

type FormState = {
  id: string;
  name_uk: string;
  type: ItemType;
  category: string;
  shop_section: string;
  buy_price: string;
  sell_price: string;
  craft_level: string;
  craft_time: string;
  craft_exp: string;
  output_qty: string;
  components_complete: boolean;
  notes: string;
};

const toForm = (it: Item | null): FormState => ({
  id: it?.id ?? "",
  name_uk: it?.name_uk ?? "",
  type: it?.type ?? "raw",
  category: it?.category ?? "",
  shop_section: it?.shop_section ?? "",
  buy_price: it?.buy_price?.toString() ?? "",
  sell_price: it?.sell_price?.toString() ?? "",
  craft_level: it?.craft_level?.toString() ?? "",
  craft_time: it?.craft_time ?? "",
  craft_exp: it?.craft_exp?.toString() ?? "",
  output_qty: it?.output_qty?.toString() ?? "",
  components_complete: it?.components_complete ?? false,
  notes: it?.notes ?? "",
});

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));
const strOrNull = (s: string) => (s.trim() === "" ? null : s.trim());

export default function ItemForm({ item, onClose, onSaved, onDeleted }: Props) {
  const isEdit = item != null;
  const [f, setF] = useState<FormState>(toForm(item));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setF((prev) => ({ ...prev, [k]: v }));

  async function save() {
    setError("");
    if (!f.id.trim() || !f.name_uk.trim()) {
      setError("Потрібні id та назва.");
      return;
    }
    const payload = {
      name_uk: f.name_uk.trim(),
      type: f.type,
      category: strOrNull(f.category),
      shop_section: strOrNull(f.shop_section),
      buy_price: numOrNull(f.buy_price),
      sell_price: numOrNull(f.sell_price),
      craft_level: numOrNull(f.craft_level),
      craft_time: strOrNull(f.craft_time),
      craft_exp: numOrNull(f.craft_exp),
      output_qty: numOrNull(f.output_qty),
      components_complete: f.components_complete,
      notes: strOrNull(f.notes),
    };
    setBusy(true);
    try {
      if (isEdit) await api.updateItem(item!.id, payload);
      else await api.createItem({ id: f.id.trim(), ...payload });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!isEdit) return;
    if (!confirm(`Видалити «${item!.name_uk}»? Його рецептні зв'язки також зникнуть.`)) return;
    setBusy(true);
    try {
      await api.deleteItem(item!.id);
      onDeleted();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{isEdit ? "Редагувати виріб" : "Новий виріб"}</h2>
        <div className="form-grid">
          <div className="form-row">
            <label>id</label>
            <input className="field" value={f.id} disabled={isEdit}
              onChange={(e) => set("id", e.target.value)} placeholder="напр. healing_drink" />
          </div>
          <div className="form-row">
            <label>Назва (укр.)</label>
            <input className="field" value={f.name_uk} onChange={(e) => set("name_uk", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Тип</label>
            <select className="field" value={f.type} onChange={(e) => set("type", e.target.value as ItemType)}>
              {TYPES.map((t) => <option key={t} value={t}>{ITEM_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div className="form-row">
            <label>Категорія</label>
            <input className="field" value={f.category} onChange={(e) => set("category", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Розділ крамниці</label>
            <input className="field" value={f.shop_section} onChange={(e) => set("shop_section", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Вихід (output_qty)</label>
            <input type="number" min="1" className="field" value={f.output_qty} onChange={(e) => set("output_qty", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Закупівельна ціна</label>
            <input type="number" min="0" step="0.01" className="field" value={f.buy_price} onChange={(e) => set("buy_price", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Ціна продажу</label>
            <input type="number" min="0" step="0.01" className="field" value={f.sell_price} onChange={(e) => set("sell_price", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Рівень крафту</label>
            <input type="number" min="0" className="field" value={f.craft_level} onChange={(e) => set("craft_level", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Час крафту</label>
            <input className="field" value={f.craft_time} placeholder="00:30" onChange={(e) => set("craft_time", e.target.value)} />
          </div>
          <div className="form-row">
            <label>Досвід (XP)</label>
            <input type="number" min="0" className="field" value={f.craft_exp} onChange={(e) => set("craft_exp", e.target.value)} />
          </div>
          <div className="form-row">
            <label className="check" style={{ marginTop: 22 }}>
              <input type="checkbox" checked={f.components_complete} onChange={(e) => set("components_complete", e.target.checked)} />
              рецепт повний
            </label>
          </div>
          <div className="form-row full">
            <label>Примітки</label>
            <input className="field" value={f.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          {isEdit && <button className="btn danger small" disabled={busy} onClick={remove}>Видалити</button>}
          <span style={{ flex: 1 }} />
          <button className="btn ghost" disabled={busy} onClick={onClose}>Скасувати</button>
          <button className="btn" disabled={busy} onClick={save}>Зберегти</button>
        </div>
      </div>
    </div>
  );
}
