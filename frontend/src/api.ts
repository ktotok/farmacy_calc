import type { DataResponse, Item, ItemType, RecipeComponent } from "./types";

/* Typed fetch client. All write endpoints throw ApiError (with the backend's
   Ukrainian `detail` message) on non-2xx so the UI can surface validation. */

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) {
        detail = typeof body.detail === "string"
          ? body.detail
          : JSON.stringify(body.detail);
      }
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export const api = {
  getData: () => req<DataResponse>("/api/data", { cache: "no-store" }),

  createItem: (item: Partial<Item>) =>
    req<Item>("/api/items", json("POST", item)),
  updateItem: (id: string, patch: Partial<Item>) =>
    req<Item>(`/api/items/${id}`, json("PUT", patch)),
  deleteItem: (id: string) =>
    req<void>(`/api/items/${id}`, { method: "DELETE" }),

  savePrices: (updates: { id: string; field: "buy_price" | "sell_price"; value: number | null }[]) =>
    req<{ applied: number }>("/api/items/prices/batch", json("PUT", updates)),

  setRecipe: (productId: string, components: RecipeComponent[]) =>
    req<RecipeComponent[]>(`/api/recipes/${productId}`, json("PUT", { components })),

  importItems: (csv: string) =>
    req<unknown>("/api/import/items", { method: "POST", headers: { "Content-Type": "text/plain" }, body: csv }),
  importRecipes: (csv: string) =>
    req<unknown>("/api/import/recipes", { method: "POST", headers: { "Content-Type": "text/plain" }, body: csv }),
};

export const TYPES: ItemType[] = ["raw", "intermediate", "product", "shop"];
