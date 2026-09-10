import { useQuery } from "@tanstack/react-query";
import {
  getBobbinShifts,
  getBobbins,
  getDebts,
  getPeriodSummary,
  getPnL,
  getProduction,
  getSalesByProduct,
  getStockMovement,
  getStockReport,
  type PeriodParams,
  type RevenueModeParams,
  type StockMovementParams,
  type StockReportParams,
} from "@/lib/api/reports";

export function useDebts(onlyDebtors: boolean) {
  return useQuery({
    queryKey: ["report-debts", onlyDebtors],
    queryFn: () => getDebts(onlyDebtors).then((r) => r.data),
  });
}

export function usePnLReport(params: RevenueModeParams) {
  return useQuery({
    queryKey: ["report-pnl", params],
    queryFn: () => getPnL(params).then((r) => r.data),
  });
}

export function useProductionReport(params: PeriodParams) {
  return useQuery({
    queryKey: ["report-production", params],
    queryFn: () => getProduction(params).then((r) => r.data),
  });
}

export function useBobbinsReport(params: PeriodParams) {
  return useQuery({
    queryKey: ["report-bobbins", params],
    queryFn: () => getBobbins(params).then((r) => r.data),
  });
}

/** Детализация по сменам для одной бабины (грузится при открытии поп-апа). */
export function useBobbinShifts(bobbinId: string | null, params: PeriodParams) {
  return useQuery({
    queryKey: ["report-bobbin-shifts", bobbinId, params],
    queryFn: () => getBobbinShifts(bobbinId!, params).then((r) => r.data),
    enabled: !!bobbinId,
  });
}

export function useStockReport(params: StockReportParams) {
  return useQuery({
    queryKey: ["report-stock", params],
    queryFn: () => getStockReport(params).then((r) => r.data),
  });
}

export function useSalesByProduct(params: PeriodParams) {
  return useQuery({
    queryKey: ["report-sales-by-product", params],
    queryFn: () => getSalesByProduct(params).then((r) => r.data),
  });
}

export function usePeriodSummary(params: PeriodParams) {
  return useQuery({
    queryKey: ["report-period-summary", params],
    queryFn: () => getPeriodSummary(params).then((r) => r.data),
  });
}

export function useStockMovement(params: StockMovementParams) {
  return useQuery({
    queryKey: ["report-stock-movement", params],
    queryFn: () => getStockMovement(params).then((r) => r.data),
  });
}
