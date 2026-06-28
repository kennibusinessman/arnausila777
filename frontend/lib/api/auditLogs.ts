import { http } from "@/lib/api/http";
import type { AuditLogRead } from "@/lib/types/audit";
import type { Message, Page, PageParams } from "@/lib/types/common";

export interface ListAuditLogsParams extends Partial<PageParams> {
  user_id?: string;
  action?: string;
  entity_type?: string;
  entity_id?: string;
  date_from?: string;
  date_to?: string;
}

export const listAuditLogs = (params: ListAuditLogsParams = {}) =>
  http.get<Page<AuditLogRead>>("/audit-logs", { params });

export const deleteAuditLog = (logId: string) => http.delete<Message>(`/audit-logs/${logId}`);
