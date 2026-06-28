import { WarehouseType } from "@/lib/types/enums";
import type { WarehouseRead } from "@/lib/types/warehouse";

/**
 * Склады скрыты из интерфейса (см. backend/app/services/shift_report_service.py
 * _RAW_TYPES/_FINISHED_TYPES) — фронтенд сам подбирает подходящий активный склад
 * вместо того, чтобы спрашивать пользователя.
 */
export const RAW_WAREHOUSE_TYPES: WarehouseType[] = [WarehouseType.RAW_MATERIALS, WarehouseType.MIXED];
export const FINISHED_WAREHOUSE_TYPES: WarehouseType[] = [WarehouseType.FINISHED_GOODS, WarehouseType.MIXED];

export function pickWarehouseId(warehouses: WarehouseRead[], types: WarehouseType[]): string | null {
  const match = warehouses.find((w) => w.is_active && types.includes(w.type));
  return match?.id ?? null;
}
