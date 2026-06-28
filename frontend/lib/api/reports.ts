import { http } from "@/lib/api/http";
import type { ItemType, RevenueMode } from "@/lib/types/enums";
import type {
  DashboardResponse,
  DebtsResponse,
  ExpenseByCategoryRow,
  PnLResponse,
  ProductionRow,
  RevenueExpenseTrendPoint,
  SalesByProductRow,
  StockMovementRow,
  StockReportRow,
} from "@/lib/types/report";

export interface PeriodParams {
  date_from?: string;
  date_to?: string;
}

export interface RevenueModeParams extends PeriodParams {
  revenue_mode?: RevenueMode;
}

export const getDebts = (only_debtors: boolean = true) =>
  http.get<DebtsResponse>("/reports/debts", { params: { only_debtors } });

export const getDashboard = (params: RevenueModeParams = {}) =>
  http.get<DashboardResponse>("/reports/dashboard", { params });

export const getPnL = (params: RevenueModeParams = {}) =>
  http.get<PnLResponse>("/reports/pnl", { params });

export const getExpensesByCategory = (params: PeriodParams = {}) =>
  http.get<ExpenseByCategoryRow[]>("/reports/expenses-by-category", { params });

export const getRevenueExpenseTrend = (params: RevenueModeParams = {}) =>
  http.get<RevenueExpenseTrendPoint[]>("/reports/revenue-expense-trend", { params });

export const getProduction = (params: PeriodParams = {}) =>
  http.get<ProductionRow[]>("/reports/production", { params });

export const getSalesByProduct = (params: PeriodParams = {}) =>
  http.get<SalesByProductRow[]>("/reports/sales-by-product", { params });

export interface StockMovementParams extends PeriodParams {
  warehouse_id?: string;
  item_type?: ItemType;
}

export const getStockMovement = (params: StockMovementParams = {}) =>
  http.get<StockMovementRow[]>("/reports/stock-movement", { params });

export interface StockReportParams {
  warehouse_id?: string;
  item_type?: ItemType;
  include_zero?: boolean;
}

export const getStockReport = (params: StockReportParams = {}) =>
  http.get<StockReportRow[]>("/reports/stock", { params });
