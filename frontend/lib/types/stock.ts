/** Зеркало backend/app/schemas/stock.py */
import type { ItemType, MovementType, SourceType } from "./enums";

export const AdjustmentDirection = { IN: "IN", OUT: "OUT" } as const;
export type AdjustmentDirection = (typeof AdjustmentDirection)[keyof typeof AdjustmentDirection];

export interface StockBalanceRead {
  id: string;
  warehouse_id: string;
  item_type: ItemType;
  product_id: string | null;
  material_id: string | null;
  quantity: string;
  updated_at: string;
}

export interface StockMovementRead {
  id: string;
  warehouse_id: string;
  item_type: ItemType;
  product_id: string | null;
  material_id: string | null;
  movement_type: MovementType;
  quantity: string;
  unit: string;
  unit_cost: string | null;
  total_cost: string | null;
  source_type: SourceType;
  source_id: string | null;
  comment: string | null;
  created_by: string;
  created_at: string;
}

/** Ссылка на документ-источник движения (для перехода из истории склада). */
export interface MovementSourceRef {
  kind: "order" | "shift_report" | "expense" | "inventory";
  id: string;
}

/** Строка истории движений позиции: движение + автор + остаток после + документ-источник. */
export interface StockMovementHistoryRead extends StockMovementRead {
  created_by_name: string | null;
  balance_after: string;
  source_ref: MovementSourceRef | null;
}

export interface AdjustmentCreate {
  warehouse_id: string;
  item_type: ItemType;
  product_id?: string | null;
  material_id?: string | null;
  quantity: string;
  direction: AdjustmentDirection;
  unit: string;
  unit_cost?: string | null;
  comment?: string | null;
}

/** Позиция страницы «Инвентаризация»: остаток суммарно по всем складам (нулевые тоже). */
export interface InventoryItemRead {
  item_type: ItemType;
  item_id: string;
  name: string;
  category: string | null;
  subcategory: string | null;
  unit: string;
  is_active: boolean;
  quantity: string;
}

export interface InventoryLine {
  item_type: ItemType;
  item_id: string;
  /** Фактический остаток — каким он должен стать. */
  quantity: string;
  /** Остаток, который видел пользователь: если он успел измениться — 409. */
  expected_quantity?: string | null;
}

export interface InventoryApply {
  items: InventoryLine[];
  comment?: string | null;
}

export interface InventoryChange {
  item_type: ItemType;
  item_id: string;
  name: string;
  unit: string;
  before: string;
  after: string;
}

export interface InventoryResult {
  changes: InventoryChange[];
  movements_created: number;
  /** Документ в «Истории»; null — менять было нечего, документ не создан. */
  inventory_id: string | null;
}

/** Строка «Истории инвентаризаций». */
export interface InventoryHistoryRead {
  id: string;
  created_at: string;
  created_by: string;
  created_by_name: string | null;
  comment: string | null;
  positions: number;
  in_count: number;
  out_count: number;
}

/** Результат одной инвентаризации: каждая изменённая позиция «было → стало». */
export interface InventoryHistoryDetail extends InventoryHistoryRead {
  lines: InventoryChange[];
}
