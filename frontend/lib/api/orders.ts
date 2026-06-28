import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type {
  OrderCreate,
  OrderListItem,
  OrderRead,
  OrderSummary,
  OrderUpdate,
} from "@/lib/types/order";

export interface OrderFilterParams {
  client_id?: string;
  manager_id?: string;
  date_from?: string;
  date_to?: string;
  deadline_from?: string;
  deadline_to?: string;
  search?: string;
}

export interface ListOrdersParams extends Partial<PageParams>, OrderFilterParams {
  sort?: "asc" | "desc";
}

export const listOrders = (params: ListOrdersParams = {}) =>
  http.get<Page<OrderListItem>>("/orders", { params });

export const getOrdersSummary = (params: OrderFilterParams = {}) =>
  http.get<OrderSummary>("/orders/summary", { params });

export const createOrder = (data: OrderCreate) => http.post<OrderRead>("/orders", data);

export const getOrder = (orderId: string) => http.get<OrderRead>(`/orders/${orderId}`);

export const updateOrder = (orderId: string, data: OrderUpdate) =>
  http.patch<OrderRead>(`/orders/${orderId}`, data);

export const deleteOrder = (orderId: string) => http.delete<Message>(`/orders/${orderId}`);
