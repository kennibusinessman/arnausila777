import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteAuditLog, listAuditLogs, type ListAuditLogsParams } from "@/lib/api/auditLogs";

export function useAuditLogsList(params: ListAuditLogsParams) {
  return useQuery({
    queryKey: ["audit-logs", params],
    queryFn: () => listAuditLogs(params).then((r) => r.data),
  });
}

export function useDeleteAuditLog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAuditLog(id).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["audit-logs"] }),
  });
}
