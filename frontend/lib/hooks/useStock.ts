import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createStockAdjustment,
  deleteStockMovement,
  listStockBalances,
  listStockItemHistory,
  listStockMovements,
  type ItemHistoryParams,
  type ListBalancesParams,
  type ListMovementsParams,
} from "@/lib/api/stock";
import type { AdjustmentCreate } from "@/lib/types/stock";

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
    },
  });
}
