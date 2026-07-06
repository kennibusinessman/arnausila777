import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveShiftReport,
  createShiftReport,
  deleteShiftReport,
  getShiftReport,
  listMyShiftReports,
  listShiftReports,
  rejectShiftReport,
  submitShiftReport,
  updateShiftReport,
  type ListShiftReportsParams,
} from "@/lib/api/shiftReports";
import type {
  ApproveRequest,
  RejectRequest,
  ShiftReportCreate,
  ShiftReportUpdate,
} from "@/lib/types/shiftReport";

export function useShiftReportsList(params: ListShiftReportsParams, isMaster: boolean) {
  return useQuery({
    queryKey: ["shift-reports", params, isMaster],
    queryFn: () =>
      (isMaster ? listMyShiftReports(params) : listShiftReports(params)).then((r) => r.data),
  });
}

export function useShiftReport(reportId: string | undefined) {
  return useQuery({
    queryKey: ["shift-report", reportId],
    queryFn: () => getShiftReport(reportId!).then((r) => r.data),
    enabled: !!reportId,
  });
}

function useInvalidateShiftReports(reportId?: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["shift-reports"] });
    if (reportId) qc.invalidateQueries({ queryKey: ["shift-report", reportId] });
    // Утверждение и правка утверждённого отчёта меняют склад — обновляем остатки.
    qc.invalidateQueries({ queryKey: ["stock-balances"] });
    qc.invalidateQueries({ queryKey: ["stock-movements"] });
  };
}

export function useCreateShiftReport() {
  const invalidate = useInvalidateShiftReports();
  return useMutation({
    mutationFn: (data: ShiftReportCreate) => createShiftReport(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateShiftReport(reportId: string) {
  const invalidate = useInvalidateShiftReports(reportId);
  return useMutation({
    mutationFn: (data: ShiftReportUpdate) => updateShiftReport(reportId, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useSubmitShiftReport(reportId: string) {
  const invalidate = useInvalidateShiftReports(reportId);
  return useMutation({
    mutationFn: () => submitShiftReport(reportId).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useApproveShiftReport(reportId: string) {
  const invalidate = useInvalidateShiftReports(reportId);
  return useMutation({
    mutationFn: (data: ApproveRequest = {}) => approveShiftReport(reportId, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useRejectShiftReport(reportId: string) {
  const invalidate = useInvalidateShiftReports(reportId);
  return useMutation({
    mutationFn: (data: RejectRequest) => rejectShiftReport(reportId, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteShiftReport() {
  // Удаление утверждённой смены откатывает её движения по складу — обновляем остатки.
  const invalidate = useInvalidateShiftReports();
  return useMutation({
    mutationFn: (reportId: string) => deleteShiftReport(reportId).then((r) => r.data),
    onSuccess: invalidate,
  });
}
