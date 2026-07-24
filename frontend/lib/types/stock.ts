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

/** Строка истории движений позиции: движение + автор + остаток после проведения. */
export interface StockMovementHistoryRead extends StockMovementRead {
  created_by_name: string | null;
  balance_after: string;
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
