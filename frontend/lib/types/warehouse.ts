/** Зеркало backend/app/schemas/warehouse.py */
import type { WarehouseType } from "./enums";

export interface WarehouseCreate {
  name: string;
  type: WarehouseType;
  is_active?: boolean;
}

export interface WarehouseUpdate {
  name?: string | null;
  type?: WarehouseType | null;
  is_active?: boolean | null;
}

export interface WarehouseRead {
  id: string;
  name: string;
  type: WarehouseType;
  is_active: boolean;
  created_at: string;
}
