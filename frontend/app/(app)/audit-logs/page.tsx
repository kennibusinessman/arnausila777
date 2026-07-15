"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DetailModal } from "@/components/ui/DetailModal";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import { useAuditLogsList, useDeleteAuditLog } from "@/lib/hooks/useAuditLogs";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import type { AuditLogRead } from "@/lib/types/audit";
import { formatDateTime } from "@/lib/utils/format";
import {
  ACTION_OPTIONS,
  ENTITY_OPTIONS,
  actionLabel,
  auditSummary,
  entityLabel,
  readableEntries,
} from "@/lib/utils/auditLabels";

const PAGE_SIZE = 30;

export default function AuditLogsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === UserRole.SUPER_ADMIN;

  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditLogRead | null>(null);

  const { data, isLoading } = useAuditLogsList({
    page,
    size: PAGE_SIZE,
    action: action || undefined,
    entity_type: entityType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  });
  const deleteLog = useDeleteAuditLog();

  function handleDelete(row: AuditLogRead) {
    if (
      !window.confirm(
        `Удалить запись аудита «${actionLabel(row.action)}» (${entityLabel(row.entity_type)})? Действие необратимо и само будет залогировано.`
      )
    )
      return;
    deleteLog.mutate(row.id, {
      onError: (err) => window.alert(apiErrorMessage(err, "Не удалось удалить запись")),
    });
  }

  const columns: DataTableColumn<AuditLogRead>[] = [
    { header: "Дата", cell: (row) => formatDateTime(row.created_at) },
    { header: "Пользователь", cell: (row) => row.user_name ?? "—" },
    { header: "Действие", cell: (row) => actionLabel(row.action) },
    { header: "Объект", cell: (row) => entityLabel(row.entity_type) },
    {
      header: "Детали",
      cell: (row) => (
        <span className="block max-w-[300px] truncate text-xs text-muted" title={auditSummary(row)}>
          {auditSummary(row)}
        </span>
      ),
    },
    ...(isSuperAdmin
      ? [
          {
            header: "",
            align: "right" as const,
            cell: (row: AuditLogRead) => (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-bg"
                onClick={() => handleDelete(row)}
              >
                Удалить
              </Button>
            ),
          },
        ]
      : []),
  ];

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const rows = data?.items ?? [];

  const paginationControls = (
    <>
      <span>{total === 0 ? "Нет записей" : `Показано ${from}–${to} из ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Назад
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
          Вперёд ›
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-end gap-3 rounded-3xl p-3.5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Действие</label>
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Все</option>
            {ACTION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Объект</label>
          <select
            value={entityType}
            onChange={(e) => {
              setEntityType(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-[13px]"
          >
            <option value="">Все</option>
            {ENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">С даты</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-[13px]"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">По дату</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-[13px]"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Десктоп (lg+) — таблица */}
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={rows}
              keyField={(row) => row.id}
              emptyMessage="Записи не найдены"
              footer={paginationControls}
            />
          </div>

          {/* Телефон/планшет (< lg) — карточки + поп-ап */}
          <MobileCardList
            rows={rows}
            keyField={(row) => row.id}
            emptyMessage="Записи не найдены"
            footer={paginationControls}
            renderCard={(row) => (
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13px] font-semibold text-text">{actionLabel(row.action)}</span>
                  <span className="truncate text-xs text-muted">
                    {entityLabel(row.entity_type)} · {row.user_name ?? "—"}
                  </span>
                  <span className="text-xs text-muted">{formatDateTime(row.created_at)}</span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
              </button>
            )}
          />
        </>
      )}

      <DetailModal
        open={!!selected}
        title={selected ? actionLabel(selected.action) : ""}
        onClose={() => setSelected(null)}
        fields={
          selected
            ? [
                { label: "Дата", value: formatDateTime(selected.created_at) },
                { label: "Пользователь", value: selected.user_name ?? "—" },
                { label: "Действие", value: actionLabel(selected.action) },
                { label: "Объект", value: entityLabel(selected.entity_type) },
              ]
            : []
        }
        actions={
          selected &&
          isSuperAdmin && (
            <Button
              variant="danger"
              className="flex-1 justify-center"
              onClick={() => {
                const r = selected;
                setSelected(null);
                handleDelete(r);
              }}
            >
              Удалить запись
            </Button>
          )
        }
      >
        {selected &&
          (readableEntries(selected.old_value).length > 0 ||
            readableEntries(selected.new_value).length > 0) && (
            <div className="flex flex-col gap-2">
              {readableEntries(selected.old_value).length > 0 && (
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Было</div>
                  <dl className="flex flex-col gap-1">
                    {readableEntries(selected.old_value).map((e) => (
                      <div key={e.label} className="flex justify-between gap-3 text-[13px]">
                        <dt className="text-muted">{e.label}</dt>
                        <dd className="text-right font-medium text-text">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              {readableEntries(selected.new_value).length > 0 && (
                <div className="rounded-2xl border border-white/60 bg-white/40 p-3">
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted">Стало</div>
                  <dl className="flex flex-col gap-1">
                    {readableEntries(selected.new_value).map((e) => (
                      <div key={e.label} className="flex justify-between gap-3 text-[13px]">
                        <dt className="text-muted">{e.label}</dt>
                        <dd className="text-right font-medium text-text">{e.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
      </DetailModal>
    </div>
  );
}
