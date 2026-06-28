import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { ExpenseCreate, ExpenseListItem, ExpenseRead, ExpenseSummary, ExpenseUpdate } from "@/lib/types/expense";

export interface ExpenseFilterParams {
  category_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
}

export interface ListExpensesParams extends Partial<PageParams>, ExpenseFilterParams {
  sort?: "date" | "amount";
}

export const listExpenses = (params: ListExpensesParams = {}) =>
  http.get<Page<ExpenseListItem>>("/expenses", { params });

export const getExpensesSummary = (params: ExpenseFilterParams = {}) =>
  http.get<ExpenseSummary>("/expenses/summary", { params });

export const createExpense = (data: ExpenseCreate) => http.post<ExpenseRead>("/expenses", data);

export const getExpense = (expenseId: string) => http.get<ExpenseRead>(`/expenses/${expenseId}`);

export const updateExpense = (expenseId: string, data: ExpenseUpdate) =>
  http.patch<ExpenseRead>(`/expenses/${expenseId}`, data);

export const deleteExpense = (expenseId: string) => http.delete<Message>(`/expenses/${expenseId}`);
