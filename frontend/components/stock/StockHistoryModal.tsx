"use client";

import { clsx } from "clsx";
import { ArrowUpRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useStockItemHistory } from "@/lib/hooks/useStock";
import { ItemType } from "@/lib/types/enums";
import type { MovementSourceRef, StockMovementHistoryRead } from "@/lib/types/stock";
import { formatDateTime } from "@/lib/utils/format";
import { movementTypeLabels, sourceTypeLabels } from "@/lib/utils/stockLabels";

/** Куда ведёт документ-источник движения и как назвать переход. */
const SOURCE_ROUTE: Record<MovementSourceRef["kind"], string> = {
  order: "/orders",
  shift_report: "/shift-reports",
  expense: "/expenses",
};
const SOURCE_LABEL: Record<MovementSourceRef["kind"], string> = {
  order: "Заказ",
  shift_report: "Сменный отчёт",
  expense: "Расход",
};

/** Позиция, по которой открывают историю движений (товар или материал). */
export interface StockHistoryItem {
  item_type: ItemType;
  id: string;
  name: string;
  unit: string;
}

interface StockHistoryModalProps {
  open: boolean;
  item: StockHistoryItem | null;
  onClose: () => void;
}

/** Количество без лишних нулей: «120», «12,5», «0,75». */
function fmtQty(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3 }).format(n);
}

/** Знак движения по типу: приход (+1) — всё, что заканчивается на _IN, иначе расход (−1). */
function signOf(row: StockMovementHistoryRead): 1 | -1 {
  return row.movement_type.endsWith("_IN") ? 1 : -1;
}

/**
 * Полная история движений одной позиции: кто и когда провёл движение и какой остаток
 * был на складе после него. Открывается из карточки товара/материала на «Остатках».
 */
export function StockHistoryModal({ open, item, onClose }: StockHistoryModalProps) {
  const router = useRouter();
  const history = useStockItemHistory(
    open && item
      ? {
          item_type: item.item_type,
          product_id: item.item_type === ItemType.PRODUCT ? item.id : undefined,
          material_id: item.item_type === ItemType.MATERIAL ? item.id : undefined,
        }
      : null
  );

  const rows = history.data ?? [];
  // rows[0] — самое новое движение, его balance_after = текущий остаток позиции.
  const latest = rows[0];

  // Переход к документу-источнику: закрываем историю и уходим на его страницу.
  function goToSource(ref: MovementSourceRef) {
    onClose();
    router.push(`${SOURCE_ROUTE[ref.kind]}/${ref.id}`);
  }

  const columns: DataTableColumn<StockMovementHistoryRead>[] = [
    { header: "Дата", cell: (row) => formatDateTime(row.created_at) },
    {
      header: "Движение",
      cell: (row) => (
        <Badge
          label={movementTypeLabels[row.movement_type]}
          className={signOf(row) > 0 ? "bg-success-bg text-green-800" : "bg-danger-bg text-red-800"}
        />
      ),
    },
    {
      header: "Изменение",
      align: "right",
      cell: (row) => {
        const sign = signOf(row);
        return (
          <span className={clsx("font-semibold", sign > 0 ? "text-success" : "text-danger")}>
            {sign > 0 ? "+" : "−"}
            {fmtQty(Number(row.quantity))} {row.unit}
          </span>
        );
      },
    },
    {
      header: "Остаток (было → стало)",
      align: "right",
      cell: (row) => {
        const after = Number(row.balance_after);
        const before = after - signOf(row) * Number(row.quantity);
        return (
          <span className="whitespace-nowrap">
            <span className="text-muted">{fmtQty(before)}</span>
            <span className="px-1 text-muted">→</span>
            <span className="font-bold text-text">{fmtQty(after)}</span>
            <span className="text-[11.5px] text-muted"> {row.unit}</span>
          </span>
        );
      },
    },
    { header: "Кто", cell: (row) => row.created_by_name ?? "—" },
    { header: "Источник", cell: (row) => sourceTypeLabels[row.source_type] },
    { header: "Комментарий", cell: (row) => row.comment ?? "—" },
    {
      header: "Документ",
      cell: (row) =>
        row.source_ref ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium text-primary">
            {SOURCE_LABEL[row.source_ref.kind]}
            <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
  ];

  return (
    <Modal open={open} title={`Движения — ${item?.name ?? ""}`} onClose={onClose} size="2xl">
      {history.isLoading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12.5px] text-muted">
            Всего движений: <span className="font-semibold text-text">{rows.length}</span>
            {latest && (
              <>
                {" · "}Текущий остаток:{" "}
                <span className="font-semibold text-text">
                  {fmtQty(Number(latest.balance_after))} {latest.unit}
                </span>
              </>
            )}
          </p>

          {/* Десктоп (lg+) — таблица истории */}
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={rows}
              keyField={(row) => row.id}
              emptyMessage="Движений по этой позиции пока нет"
              isRowInteractive={(row) => row.source_ref !== null}
              onRowClick={(row) => row.source_ref && goToSource(row.source_ref)}
            />
          </div>

          {/* Телефон/планшет (< lg) — карточки истории */}
          <div className="flex flex-col gap-2.5 lg:hidden">
            {rows.length === 0 ? (
              <p className="py-10 text-center text-[13.5px] text-muted">
                Движений по этой позиции пока нет
              </p>
            ) : (
              rows.map((row) => {
                const sign = signOf(row);
                const after = Number(row.balance_after);
                const before = after - sign * Number(row.quantity);
                const ref = row.source_ref;
                const inner = (
                  <>
                    <div className="flex items-center justify-between gap-2">
                      <Badge
                        label={movementTypeLabels[row.movement_type]}
                        className={sign > 0 ? "bg-success-bg text-green-800" : "bg-danger-bg text-red-800"}
                      />
                      <span className={clsx("text-[14px] font-bold tabular-nums", sign > 0 ? "text-success" : "text-danger")}>
                        {sign > 0 ? "+" : "−"}
                        {fmtQty(Number(row.quantity))} {row.unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[12.5px]">
                      <span className="text-muted">Остаток</span>
                      <span className="tabular-nums">
                        <span className="text-muted">{fmtQty(before)}</span>
                        <span className="px-1 text-muted">→</span>
                        <span className="font-bold text-text">{fmtQty(after)}</span>
                        <span className="text-[11px] text-muted"> {row.unit}</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-muted">
                      <span>{formatDateTime(row.created_at)}</span>
                      <span>·</span>
                      <span>{sourceTypeLabels[row.source_type]}</span>
                      <span>·</span>
                      <span>{row.created_by_name ?? "—"}</span>
                    </div>
                    {row.comment && <p className="text-[12.5px] text-text">{row.comment}</p>}
                    {ref && (
                      <span className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-medium text-primary">
                        Открыть: {SOURCE_LABEL[ref.kind]}
                        <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                    )}
                  </>
                );
                return ref ? (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => goToSource(ref)}
                    className="glass flex w-full flex-col gap-2 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
                  >
                    {inner}
                  </button>
                ) : (
                  <div key={row.id} className="glass flex flex-col gap-2 rounded-3xl p-4">
                    {inner}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
