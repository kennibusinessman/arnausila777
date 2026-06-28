import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createExpenseCategory, listExpenseCategories } from "@/lib/api/expenseCategories";
import type { ExpenseCategoryCreate } from "@/lib/types/expense";

export function useExpenseCategoryOptions() {
  return useQuery({
    queryKey: ["expense-category-options"],
    queryFn: () => listExpenseCategories({ size: 100, is_active: true }).then((r) => r.data.items),
    staleTime: 60_000,
  });
}

/** Категории создаются «на ходу» прямо в форме расхода (см. ExpenseForm) — отдельной страницы нет. */
export function useCreateExpenseCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ExpenseCategoryCreate) => createExpenseCategory(data).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expense-category-options"] }),
  });
}
