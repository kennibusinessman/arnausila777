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
  /** Только у бабин: норма выхода рулонов и привязанное наименование продукции.
   *  Меняются по праву products.set_norm. */
  roll_norm?: number | null;
  roll_product_id?: string | null;
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
  roll_norm?: number | null;
  roll_product_id?: string | null;
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
  roll_norm: number | null;
  roll_product_id: string | null;
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
  /** Норма выхода рулонов с бабины и наименование продукции, которое из неё
   *  крутят (только у позиций подкатегории «Бабины»). */
  roll_norm: number | null;
  roll_product_id: string | null;
  roll_product_name: string | null;
  /** Кто и когда завёл позицию. Приходит только с правом «журнал аудита»;
   *  у позиций, заведённых до появления этой колонки, автор неизвестен (null). */
  created_by_name: string | null;
  created_at: string | null;
}

export interface CatalogResponse {
  items: CatalogItem[];
}
