"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Spinner } from "@/components/ui/Spinner";
import { ShiftReportForm, type ShiftReportFormValues } from "@/components/shiftReports/ShiftReportForm";
import { useAuthStore } from "@/lib/auth/store";
import {
  useApproveShiftReport,
  useDeleteShiftReport,
  useRejectShiftReport,
  useShiftReport,
  useSubmitShiftReport,
  useUpdateShiftReport,
} from "@/lib/hooks/useShiftReports";
import { useWarehouseOptions } from "@/lib/hooks/useWarehouses";
import { apiErrorMessage } from "@/lib/api/http";
import { ShiftReportStatus, UserRole } from "@/lib/types/enums";
import type { OutputRead, ShiftMaterialRead } from "@/lib/types/shiftReport";
import { formatDateTime, formatNumber } from "@/lib/utils/format";
import { SHIFT_TYPE_LABELS } from "@/lib/utils/shiftLabels";
import { shiftReportStatusStyles } from "@/lib/utils/statusStyles";
import { FINISHED_WAREHOUSE_TYPES, RAW_WAREHOUSE_TYPES, pickWarehouseId } from "@/lib/utils/warehouseResolution";

const EDITABLE = new Set<ShiftReportStatus>([ShiftReportStatus.DRAFT, ShiftReportStatus.REJECTED]);

const outputColumns: DataTableColumn<OutputRead>[] = [
  { header: "Продукция", cell: (row) => row.product?.name ?? row.product_id },
  { header: "Выпуск", align: "right", cell: (row) => `${formatNumber(row.quantity, 3)} ${row.product?.unit ?? ""}` },
  { header: "Брак", align: "right", cell: (row) => formatNumber(row.defect_quantity, 3) },
];

const materialColumns: DataTableColumn<ShiftMaterialRead>[] = [
  {
    header: "Сырьё",
    cell: (row) =>
      row.material?.name ?? row.product?.name ?? row.material_id ?? row.product_id ?? "—",
  },
  {
    header: "Расход",
    align: "right",
    cell: (row) =>
      `${formatNumber(row.quantity_used, 3)} ${row.material?.unit ?? row.product?.unit ?? ""}`,
  },
];

export default function ShiftReportDetailPage() {
  const params = useParams<{ id: string }>();
  const reportId = params.id;
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const userId = useAuthStore((s) => s.user?.id);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;
  // Утверждать/отклонять отчёты может ещё и зав. складом (правка/удаление — нет).
  const canApprove = isAdmin || role === UserRole.WAREHOUSE_MANAGER;

  const { data: report, isLoading, isError, error } = useShiftReport(reportId);
  const updateReport = useUpdateShiftReport(reportId);
  const submitReport = useSubmitShiftReport(reportId);
  const approveReport = useApproveShiftReport(reportId);
  const rejectReport = useRejectShiftReport(reportId);
  const deleteReport = useDeleteShiftReport();

  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const warehouses = useWarehouseOptions();

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (isError || !report) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {apiErrorMessage(error, "Отчёт не найден")}
      </p>
    );
  }

  const isOwner = report.master_id === userId;
  const canEdit = EDITABLE.has(report.status) && (isAdmin || isOwner);

  function handleEditSubmit(values: ShiftReportFormValues) {
    setActionError(null);
    updateReport.mutate(
      {
        shift_date: values.shift_date,
        shift_type: values.shift_type,
        comment: values.comment || null,
        downtime_hours: values.downtime_hours,
        outputs: values.outputs,
        materials: values.materials,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setActionError(apiErrorMessage(err, "Не удалось сохранить отчёт")),
      }
    );
  }

  function handleSubmitReport() {
    setActionError(null);
    submitReport.mutate(undefined, {
      onError: (err) => setActionError(apiErrorMessage(err, "Не удалось отправить отчёт")),
    });
  }

  function handleApprove() {
    setActionError(null);
    const list = warehouses.data ?? [];
    approveReport.mutate(
      {
        raw_warehouse_id: pickWarehouseId(list, RAW_WAREHOUSE_TYPES),
        finished_warehouse_id: pickWarehouseId(list, FINISHED_WAREHOUSE_TYPES),
      },
      { onError: (err) => setActionError(apiErrorMessage(err, "Не удалось утвердить отчёт")) }
    );
  }

  function handleReject() {
    const comment = window.prompt("Причина отклонения:");
    if (!comment) return;
    setActionError(null);
    rejectReport.mutate(
      { comment },
      { onError: (err) => setActionError(apiErrorMessage(err, "Не удалось отклонить отчёт")) }
    );
  }

  function handleDelete() {
    if (!report) return;
    if (!window.confirm("Удалить сменный отчёт? Действие необратимо.")) return;
    deleteReport.mutate(report.id, {
      onSuccess: () => router.push("/shift-reports"),
      onError: (err) => setActionError(apiErrorMessage(err, "Не удалось удалить отчёт")),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/shift-reports" className="text-sm text-muted hover:text-text">
        ‹ К списку отчётов
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-lg font-bold text-text">
                {SHIFT_TYPE_LABELS[report.shift_type]} · {new Date(report.shift_date).toLocaleDateString("ru-RU")}
              </h2>
              <Badge {...shiftReportStatusStyles[report.status]} />
            </div>
            <p className="mt-1 text-[13px] text-muted">Создан {formatDateTime(report.created_at)}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs font-semibold text-muted">Мастер смены</div>
            <div>{report.master?.full_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Утверждено</div>
            <div>{report.approver ? `${report.approver.full_name}, ${formatDateTime(report.approved_at)}` : "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Простой за смену</div>
            <div>{formatNumber(report.downtime_hours, 1)} ч</div>
          </div>
        </div>
        {report.comment && (
          <div className="mt-3 text-sm">
            <div className="text-xs font-semibold text-muted">Комментарий</div>
            <div>{report.comment}</div>
          </div>
        )}
      </Card>

      {actionError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">{actionError}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {canEdit && !editing && (
          <>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Редактировать
            </Button>
            <Button size="sm" disabled={submitReport.isPending} onClick={handleSubmitReport}>
              Отправить на утверждение
            </Button>
          </>
        )}
        {canApprove && report.status === ShiftReportStatus.SUBMITTED && (
          <>
            <Button variant="success" size="sm" disabled={approveReport.isPending} onClick={handleApprove}>
              Утвердить
            </Button>
            <Button variant="danger" size="sm" disabled={rejectReport.isPending} onClick={handleReject}>
              Отклонить
            </Button>
          </>
        )}
        {isAdmin && report.status !== ShiftReportStatus.APPROVED && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDelete}
            className="ml-auto text-danger hover:bg-danger-bg"
          >
            Удалить отчёт
          </Button>
        )}
      </div>

      {editing ? (
        <Card title="Редактирование отчёта">
          <ShiftReportForm
            initial={{
              shift_date: report.shift_date,
              shift_type: report.shift_type,
              comment: report.comment ?? "",
              downtime_hours: report.downtime_hours ?? "0",
              outputs: report.outputs.map((o) => ({
                product_id: o.product_id,
                quantity: o.quantity,
                defect_quantity: o.defect_quantity,
                comment: o.comment ?? undefined,
              })),
              materials: report.materials.map((m) => ({
                material_id: m.material_id,
                product_id: m.product_id,
                quantity_used: m.quantity_used,
                comment: m.comment ?? undefined,
              })),
            }}
            submitLabel="Сохранить изменения"
            submitting={updateReport.isPending}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Выпуск продукции">
            <DataTable columns={outputColumns} rows={report.outputs} keyField={(row) => row.id} />
          </Card>
          <Card title="Расход сырья">
            <DataTable columns={materialColumns} rows={report.materials} keyField={(row) => row.id} />
          </Card>
        </div>
      )}
    </div>
  );
}
