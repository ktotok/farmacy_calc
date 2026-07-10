export type ItemType = "raw" | "intermediate" | "product";

export interface Item {
  id: string;
  name_uk: string;
  category: string | null;
  type: ItemType;
  buy_price: number | null;
  craft_level: number | null;
  craft_time: string | null;
  craft_exp: number | null;
  output_qty: number | null;
  shop_section: string | null;
  sell_price: number | null;
  components_complete: boolean;
  notes: string | null;
}

export interface RecipeComponent {
  product_id: string;
  component_id: string;
  quantity: number;
}

export interface DataResponse {
  items: Item[];
  recipes: RecipeComponent[];
}

// One recorded sale. unit_price/unit_cost are snapshots from the moment of sale;
// item_id is null if the item was later deleted (item_name preserves the name).
export interface Sale {
  id: number;
  item_id: string | null;
  item_name: string;
  quantity: number;
  unit_price: number;
  unit_cost: number | null;
  sold_at: string;
  created_at: string;
}
