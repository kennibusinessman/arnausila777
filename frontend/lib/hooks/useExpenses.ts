import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createExpense,
  deleteExpense,
  getExpense,
  getExpensesSummary,
  listExpenses,
  updateExpense,
  type ExpenseFilterParams,
  type ListExpensesParams,
} from "@/lib/api/expenses";
import type { ExpenseCreate, ExpenseUpdate } from "@/lib/types/expense";

export function useExpensesList(params: ListExpensesParams) {
  return useQuery({
    queryKey: ["expenses", params],
    queryFn: () => listExpenses(params).then((r) => r.data),
  });
}

/** Агрегаты (count/сумма/категории) по тем же фильтрам, что и список — для KPI периода. */
export function useExpensesSummary(params: ExpenseFilterParams) {
  return useQuery({
    queryKey: ["expenses-summary", params],
    queryFn: () => getExpensesSummary(params).then((r) => r.data),
  });
}

export function useExpense(expenseId: string | undefined) {
  return useQuery({
    queryKey: ["expense", expenseId],
    queryFn: () => getExpense(expenseId!).then((r) => r.data),
    enabled: !!expenseId,
  });
}

function useInvalidateExpenses(expenseId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["expenses"] });
    qc.invalidateQueries({ queryKey: ["expenses-summary"] });
    if (expenseId) qc.invalidateQueries({ queryKey: ["expense", expenseId] });
  };
}

export function useCreateExpense() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (data: ExpenseCreate) => createExpense(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateExpense(expenseId: string) {
  const invalidate = useInvalidateExpenses(expenseId);
  return useMutation({
    mutationFn: (data: ExpenseUpdate) => updateExpense(expenseId, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteExpense() {
  const invalidate = useInvalidateExpenses();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(expenseId).then((r) => r.data),
    onSuccess: invalidate,
  });
}
