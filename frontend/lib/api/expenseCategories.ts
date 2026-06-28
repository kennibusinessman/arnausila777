import { http } from "@/lib/api/http";
import type { Page, PageParams } from "@/lib/types/common";
import type {
  ExpenseCategoryCreate,
  ExpenseCategoryRead,
  ExpenseCategoryUpdate,
} from "@/lib/types/expense";

export interface ListExpenseCategoriesParams extends Partial<PageParams> {
  is_active?: boolean;
}

export const listExpenseCategories = (params: ListExpenseCategoriesParams = {}) =>
  http.get<Page<ExpenseCategoryRead>>("/expense-categories", { params });

export const createExpenseCategory = (data: ExpenseCategoryCreate) =>
  http.post<ExpenseCategoryRead>("/expense-categories", data);

export const getExpenseCategory = (categoryId: string) =>
  http.get<ExpenseCategoryRead>(`/expense-categories/${categoryId}`);

export const updateExpenseCategory = (categoryId: string, data: ExpenseCategoryUpdate) =>
  http.patch<ExpenseCategoryRead>(`/expense-categories/${categoryId}`, data);
