/** Зеркало backend/app/schemas/report.py */
import type { ExpenseCategoryType, ItemType, RevenueMode } from "./enums";

export interface DebtRow {
  client_id: string;
  client_name: string;
  company_name: string | null;
  manager_id: string | null;
  total_shipped: string;
  total_paid: string;
  debt: string;
  last_shipment_date: string | null;
  last_payment_date: string | null;
}

export interface DebtsResponse {
  rows: DebtRow[];
  total_debt: string;
}

export interface DashboardResponse {
  date_from: string | null;
  date_to: string | null;
  revenue_mode: RevenueMode;
  gross_revenue: string;
  cash_revenue: string;
  revenue: string;
  total_expenses: string;
  net_profit: string;
  accounts_receivable: string;
  orders_count: number;
  shipments_count: number;
  payments_count: number;
}

export interface ExpenseByCategoryRow {
  category_id: string;
  category_name: string;
  type: ExpenseCategoryType;
  total_amount: string;
  count: number;
}

export interface PnLResponse {
  date_from: string | null;
  date_to: string | null;
  revenue_mode: RevenueMode;
  gross_revenue: string;
  cash_revenue: string;
  revenue: string;
  total_expenses: string;
  net_profit: string;
  expenses_by_category: ExpenseByCategoryRow[];
}

export interface ProductionRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  total_quantity: string;
  total_defect: string;
}

export interface StockReportRow {
  warehouse_id: string;
  warehouse_name: string;
  item_type: ItemType;
  item_id: string;
  item_name: string;
  sku: string | null;
  unit: string;
  quantity: string;
}

export interface RevenueExpenseTrendPoint {
  period: string;
  revenue: string;
  expenses: string;
}

export interface SalesByProductRow {
  product_id: string;
  product_name: string;
  sku: string | null;
  unit: string;
  total_quantity: string;
  total_revenue: string;
  avg_price: string;
  shipment_count: number;
}

export interface StockMovementRow {
  item_type: ItemType;
  item_id: string;
  item_name: string;
  sku: string | null;
  unit: string;
  total_in: string;
  total_out: string;
  balance: string;
}
