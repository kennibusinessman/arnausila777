import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { ShiftReportStatus, ShiftType } from "@/lib/types/enums";
import type {
  ApproveRequest,
  RejectRequest,
  ShiftReportCreate,
  ShiftReportListItem,
  ShiftReportRead,
  ShiftReportUpdate,
} from "@/lib/types/shiftReport";

export interface ListShiftReportsParams extends Partial<PageParams> {
  status?: ShiftReportStatus;
  shift_type?: ShiftType;
  master_id?: string;
  date_from?: string;
  date_to?: string;
}

export const listShiftReports = (params: ListShiftReportsParams = {}) =>
  http.get<Page<ShiftReportListItem>>("/shift-reports", { params });

export const listMyShiftReports = (params: Omit<ListShiftReportsParams, "master_id"> = {}) =>
  http.get<Page<ShiftReportListItem>>("/shift-reports/my", { params });

export const createShiftReport = (data: ShiftReportCreate) =>
  http.post<ShiftReportRead>("/shift-reports", data);

export const getShiftReport = (reportId: string) =>
  http.get<ShiftReportRead>(`/shift-reports/${reportId}`);

export const updateShiftReport = (reportId: string, data: ShiftReportUpdate) =>
  http.patch<ShiftReportRead>(`/shift-reports/${reportId}`, data);

export const submitShiftReport = (reportId: string) =>
  http.post<ShiftReportRead>(`/shift-reports/${reportId}/submit`);

export const approveShiftReport = (reportId: string, data: ApproveRequest = {}) =>
  http.post<ShiftReportRead>(`/shift-reports/${reportId}/approve`, data);

export const rejectShiftReport = (reportId: string, data: RejectRequest) =>
  http.post<ShiftReportRead>(`/shift-reports/${reportId}/reject`, data);

export const deleteShiftReport = (reportId: string) =>
  http.delete<Message>(`/shift-reports/${reportId}`);
