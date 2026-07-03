/** Зеркало backend/app/schemas/expense.py */
import type { ExpenseCategoryType } from "./enums";

export interface ExpenseCategoryCreate {
  name: string;
  type: ExpenseCategoryType;
  is_active?: boolean;
}

export interface ExpenseCategoryUpdate {
  name?: string | null;
  type?: ExpenseCategoryType | null;
  is_active?: boolean | null;
}

export interface ExpenseCategoryRead {
  id: string;
  name: string;
  type: ExpenseCategoryType;
  is_active: boolean;
  created_at: string;
}

export interface ExpenseCreate {
  name: string;
  expense_date: string;
  category_id: string;
  amount: string;
  responsible_id?: string | null;
  comment?: string | null;
}

export interface ExpenseUpdate {
  name?: string | null;
  expense_date?: string | null;
  category_id?: string | null;
  amount?: string | null;
  responsible_id?: string | null;
  comment?: string | null;
}

interface UserBrief {
  id: string;
  full_name: string;
}

interface CategoryBrief {
  id: string;
  name: string;
  type: ExpenseCategoryType;
}

export interface ExpenseRead {
  id: string;
  name: string;
  expense_date: string;
  category_id: string;
  amount: string;
  comment: string | null;
  created_by: string;
  responsible_id: string | null;
  /** Непусто → авто-расход себестоимости сырья по заказу (правится только через заказ). */
  order_id?: string | null;
  created_at: string;
  category?: CategoryBrief | null;
  creator?: UserBrief | null;
  responsible?: UserBrief | null;
}

export interface ExpenseListItem {
  id: string;
  name: string;
  expense_date: string;
  category_id: string;
  amount: string;
  comment: string | null;
  /** Непусто → авто-расход себестоимости сырья по заказу (правится только через заказ). */
  order_id?: string | null;
  created_at: string;
  category?: CategoryBrief | null;
  responsible?: UserBrief | null;
}

export interface ExpenseSummary {
  count: number;
  total_amount: string;
  category_count: number;
}
