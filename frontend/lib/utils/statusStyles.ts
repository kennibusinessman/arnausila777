/** Цветовая логика статусов — см. design-system/components/status-badges.html. */
import { ShiftReportStatus } from "@/lib/types/enums";

export interface StatusStyle {
  label: string;
  className: string;
}

const SLATE = "bg-slate-200 text-slate-700";
const BLUE = "bg-primary-50 text-primary";
const GREEN = "bg-success-bg text-success";
const RED = "bg-danger-bg text-danger";

export const shiftReportStatusStyles: Record<ShiftReportStatus, StatusStyle> = {
  [ShiftReportStatus.DRAFT]: { label: "Черновик", className: SLATE },
  [ShiftReportStatus.SUBMITTED]: { label: "На утверждении", className: BLUE },
  [ShiftReportStatus.APPROVED]: { label: "Утверждён", className: GREEN },
  [ShiftReportStatus.REJECTED]: { label: "Отклонён", className: RED },
};
