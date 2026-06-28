import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createOrder,
  deleteOrder,
  getOrder,
  getOrdersSummary,
  listOrders,
  updateOrder,
  type ListOrdersParams,
  type OrderFilterParams,
} from "@/lib/api/orders";
import type { OrderCreate, OrderUpdate } from "@/lib/types/order";

/** Создание заказа сразу списывает остаток и наращивает долг — обновляем и склад, и отгрузки. */
function invalidateOrderEffects(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["orders"] });
  qc.invalidateQueries({ queryKey: ["shipments"] });
  qc.invalidateQueries({ queryKey: ["stock-balances"] });
  qc.invalidateQueries({ queryKey: ["stock-movements"] });
  qc.invalidateQueries({ queryKey: ["debts"] });
}

export function useOrdersList(params: ListOrdersParams) {
  return useQuery({
    queryKey: ["orders", params],
    queryFn: () => listOrders(params).then((r) => r.data),
  });
}

/** Агрегаты (count/сумма/позиции) по тем же фильтрам, что и список — для KPI периода. */
export function useOrdersSummary(params: OrderFilterParams) {
  return useQuery({
    queryKey: ["orders-summary", params],
    queryFn: () => getOrdersSummary(params).then((r) => r.data),
  });
}

/** Заказы конкретного клиента — для выбора заказа при фиксации оплаты. */
export function useOrderOptionsByClient(clientId: string | null) {
  return useQuery({
    queryKey: ["order-options-by-client", clientId],
    queryFn: () => listOrders({ client_id: clientId!, size: 100 }).then((r) => r.data.items),
    enabled: !!clientId,
  });
}

export function useOrder(orderId: string | undefined) {
  return useQuery({
    queryKey: ["order", orderId],
    queryFn: () => getOrder(orderId!).then((r) => r.data),
    enabled: !!orderId,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderCreate) => createOrder(data).then((r) => r.data),
    onSuccess: () => invalidateOrderEffects(qc),
  });
}

export function useUpdateOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderUpdate) => updateOrder(orderId, data).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["orders"] });
      qc.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => deleteOrder(orderId).then((r) => r.data),
    // Удаление возвращает товар на склад — обновляем те же срезы, что и при создании.
    onSuccess: () => invalidateOrderEffects(qc),
  });
}
