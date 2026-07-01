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
