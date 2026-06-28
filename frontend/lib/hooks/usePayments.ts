import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createPayment,
  deletePayment,
  getPaymentsSummary,
  listPayments,
  updatePayment,
  type ListPaymentsParams,
  type PaymentFilterParams,
} from "@/lib/api/payments";
import type { PaymentCreate, PaymentUpdate } from "@/lib/types/payment";

export function usePaymentsList(params: ListPaymentsParams) {
  return useQuery({
    queryKey: ["payments", params],
    queryFn: () => listPayments(params).then((r) => r.data),
  });
}

/** Агрегаты (сумма/количество/средний/клиенты) по тем же фильтрам — для KPI периода. */
export function usePaymentsSummary(params: PaymentFilterParams) {
  return useQuery({
    queryKey: ["payments-summary", params],
    queryFn: () => getPaymentsSummary(params).then((r) => r.data),
  });
}

function useInvalidatePayments() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["payments"] });
}

export function useCreatePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (data: PaymentCreate) => createPayment(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdatePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: PaymentUpdate }) =>
      updatePayment(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeletePayment() {
  const invalidate = useInvalidatePayments();
  return useMutation({
    mutationFn: (id: string) => deletePayment(id).then((r) => r.data),
    onSuccess: invalidate,
  });
}
