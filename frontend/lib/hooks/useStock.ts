import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  applyInventory,
  createStockAdjustment,
  deleteStockMovement,
  getInventoryHistory,
  listInventory,
  listInventoryHistory,
  listStockBalances,
  listStockItemHistory,
  listStockMovements,
  type ItemHistoryParams,
  type ListBalancesParams,
  type ListMovementsParams,
} from "@/lib/api/stock";
import type { AdjustmentCreate, InventoryApply } from "@/lib/types/stock";

export function useStockBalances(params: ListBalancesParams) {
  return useQuery({
    queryKey: ["stock-balances", params],
    queryFn: () => listStockBalances(params).then((r) => r.data),
  });
}

export function useStockMovements(params: ListMovementsParams) {
  return useQuery({
    queryKey: ["stock-movements", params],
    queryFn: () => listStockMovements(params).then((r) => r.data),
  });
}

/** История движений одной позиции. params=null — запрос не выполняется (модалка закрыта). */
export function useStockItemHistory(params: ItemHistoryParams | null) {
  return useQuery({
    queryKey: ["stock-history", params],
    queryFn: () => listStockItemHistory(params!).then((r) => r.data),
    enabled: params !== null,
  });
}

export function useCreateAdjustment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: AdjustmentCreate) => createStockAdjustment(data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["stock-inventory"] });
    },
  });
}

export function useDeleteStockMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteStockMovement(id).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["stock-inventory"] });
    },
  });
}

/** Таблица «Инвентаризации». enabled=false — у пользователя нет права, не запрашиваем. */
export function useInventoryItems(enabled = true) {
  return useQuery({
    queryKey: ["stock-inventory"],
    queryFn: () => listInventory().then((r) => r.data),
    enabled,
  });
}

export function useApplyInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InventoryApply) => applyInventory(data).then((r) => r.data),
    // И на успехе, и на ошибке: при 409 («остаток изменился») таблица должна
    // показать свежие цифры, чтобы пользователь сверился и сохранил ещё раз.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["stock-inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-history"] });
      qc.invalidateQueries({ queryKey: ["stock-balances"] });
      qc.invalidateQueries({ queryKey: ["stock-movements"] });
      qc.invalidateQueries({ queryKey: ["stock-history"] });
      qc.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

/** «История инвентаризаций» постранично. enabled=false — вкладка не открыта / нет права. */
export function useInventoryHistory(page: number, size: number, enabled = true) {
  return useQuery({
    queryKey: ["inventory-history", { page, size }],
    queryFn: () => listInventoryHistory({ page, size }).then((r) => r.data),
    enabled,
  });
}

/** Результат одной инвентаризации. Документ неизменяем — кэш не протухает. */
export function useInventoryHistoryDetail(id: string, enabled = true) {
  return useQuery({
    queryKey: ["inventory-history", "detail", id],
    queryFn: () => getInventoryHistory(id).then((r) => r.data),
    enabled,
    staleTime: Infinity,
  });
}
