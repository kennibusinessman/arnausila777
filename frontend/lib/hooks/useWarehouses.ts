import { useQuery } from "@tanstack/react-query";
import { listWarehouses } from "@/lib/api/warehouses";

/**
 * Склады не управляются из интерфейса — этот хук используется только для
 * автоматического подбора склада под капотом (см. lib/utils/warehouseResolution.ts).
 */
export function useWarehouseOptions() {
  return useQuery({
    queryKey: ["warehouse-options"],
    queryFn: () => listWarehouses({ size: 1000, is_active: true }).then((r) => r.data.items),
    staleTime: 60_000,
  });
}
