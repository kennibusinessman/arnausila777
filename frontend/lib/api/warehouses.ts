import { http } from "@/lib/api/http";
import type { Page, PageParams } from "@/lib/types/common";
import type { WarehouseCreate, WarehouseRead, WarehouseUpdate } from "@/lib/types/warehouse";

export interface ListWarehousesParams extends Partial<PageParams> {
  is_active?: boolean;
}

export const listWarehouses = (params: ListWarehousesParams = {}) =>
  http.get<Page<WarehouseRead>>("/warehouses", { params });

export const createWarehouse = (data: WarehouseCreate) =>
  http.post<WarehouseRead>("/warehouses", data);

export const getWarehouse = (warehouseId: string) =>
  http.get<WarehouseRead>(`/warehouses/${warehouseId}`);

export const updateWarehouse = (warehouseId: string, data: WarehouseUpdate) =>
  http.patch<WarehouseRead>(`/warehouses/${warehouseId}`, data);
