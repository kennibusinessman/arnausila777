import { useQuery } from "@tanstack/react-query";
import { getDashboard, getExpensesByCategory, getRevenueExpenseTrend } from "@/lib/api/reports";
import type { RevenueMode } from "@/lib/types/enums";

export interface DashboardFilters {
  date_from?: string;
  date_to?: string;
  revenue_mode: RevenueMode;
}

export function useDashboard(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["dashboard", filters],
    queryFn: () => getDashboard(filters).then((r) => r.data),
  });
}

export function useRevenueExpenseTrend(filters: DashboardFilters) {
  return useQuery({
    queryKey: ["revenue-expense-trend", filters],
    queryFn: () => getRevenueExpenseTrend(filters).then((r) => r.data),
  });
}

export function useExpensesByCategory(filters: Pick<DashboardFilters, "date_from" | "date_to">) {
  return useQuery({
    queryKey: ["expenses-by-category", filters],
    queryFn: () => getExpensesByCategory(filters).then((r) => r.data),
  });
}
