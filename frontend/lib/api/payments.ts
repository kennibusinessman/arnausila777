import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { PaymentMethod } from "@/lib/types/enums";
import type { PaymentCreate, PaymentRead, PaymentSummary, PaymentUpdate } from "@/lib/types/payment";

export interface PaymentFilterParams {
  client_id?: string;
  order_id?: string;
  payment_method?: PaymentMethod;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface ListPaymentsParams extends Partial<PageParams>, PaymentFilterParams {
  sort?: "asc" | "desc";
}

export const listPayments = (params: ListPaymentsParams = {}) =>
  http.get<Page<PaymentRead>>("/payments", { params });

export const getPaymentsSummary = (params: PaymentFilterParams = {}) =>
  http.get<PaymentSummary>("/payments/summary", { params });

export const createPayment = (data: PaymentCreate) => http.post<PaymentRead>("/payments", data);

export const getPayment = (paymentId: string) => http.get<PaymentRead>(`/payments/${paymentId}`);

export const updatePayment = (paymentId: string, data: PaymentUpdate) =>
  http.patch<PaymentRead>(`/payments/${paymentId}`, data);

export const deletePayment = (paymentId: string) => http.delete<Message>(`/payments/${paymentId}`);
