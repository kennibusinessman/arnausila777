/** Зеркало backend/app/schemas/product.py */

export interface ProductCreate {
  name: string;
  sku?: string | null;
  category?: string | null;
  subcategory?: string | null;
  unit: string;
  default_price?: string;
  base_weight?: string | null;
  min_stock?: string;
  is_active?: boolean;
}

export interface ProductUpdate {
  name?: string | null;
  sku?: string | null;
  category?: string | null;
  subcategory?: string | null;
  unit?: string | null;
  default_price?: string | null;
  base_weight?: string | null;
  min_stock?: string | null;
  is_active?: boolean | null;
}

export interface ProductRead {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string;
  default_price: string;
  base_weight: string | null;
  min_stock: string;
  is_active: boolean;
  created_at: string;
}

export type CatalogKind = "product" | "material";

/** Единая позиция каталога «Товары» (продукция + сырьё), зеркало backend CatalogItem. */
export interface CatalogItem {
  id: string;
  kind: CatalogKind;
  name: string;
  sku: string | null;
  category: string | null;
  subcategory: string | null;
  unit: string;
  price: string;
  base_weight: string | null;
  min_stock: string;
  quantity: string;
  is_active: boolean;
}

export interface CatalogResponse {
  items: CatalogItem[];
}
