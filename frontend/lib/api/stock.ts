import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { ItemType, MovementType, SourceType } from "@/lib/types/enums";
import type {
  AdjustmentCreate,
  InventoryApply,
  InventoryItemRead,
  InventoryResult,
  StockBalanceRead,
  StockMovementHistoryRead,
  StockMovementRead,
} from "@/lib/types/stock";

export interface ListBalancesParams extends Partial<PageParams> {
  warehouse_id?: string;
  item_type?: ItemType;
  product_id?: string;
  material_id?: string;
}

export interface ListMovementsParams extends Partial<PageParams> {
  warehouse_id?: string;
  item_type?: ItemType;
  movement_type?: MovementType;
  product_id?: string;
  material_id?: string;
  source_type?: SourceType;
}

export const listStockBalances = (params: ListBalancesParams = {}) =>
  http.get<Page<StockBalanceRead>>("/stock/balances", { params });

export const listStockMovements = (params: ListMovementsParams = {}) =>
  http.get<Page<StockMovementRead>>("/stock/movements", { params });

export interface ItemHistoryParams {
  item_type: ItemType;
  product_id?: string;
  material_id?: string;
}

/** Полная история движений одной позиции (с автором и остатком после каждого). */
export const listStockItemHistory = (params: ItemHistoryParams) =>
  http.get<StockMovementHistoryRead[]>("/stock/history", { params });

export const createStockAdjustment = (data: AdjustmentCreate) =>
  http.post<StockMovementRead>("/stock/adjustments", data);

export const deleteStockMovement = (movementId: string) =>
  http.delete<Message>(`/stock/movements/${movementId}`);

/** Все товары и сырьё с суммарным остатком — таблица «Инвентаризации». */
export const listInventory = () => http.get<InventoryItemRead[]>("/stock/inventory");

/** Фактические остатки → приход/расход на разницу (проводит бэкенд, одной транзакцией). */
export const applyInventory = (data: InventoryApply) =>
  http.post<InventoryResult>("/stock/inventory", data);
