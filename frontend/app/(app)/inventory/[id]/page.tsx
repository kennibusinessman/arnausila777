"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { DeltaPill } from "@/components/inventory/DeltaPill";
import { Card } from "@/components/ui/Card";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Spinner } from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/lib/api/http";
import { useCan } from "@/lib/auth/permissions";
import { useInventoryHistoryDetail } from "@/lib/hooks/useStock";
import { ItemType, Permission } from "@/lib/types/enums";
import type { InventoryChange } from "@/lib/types/stock";
import { formatDateTime, formatQuantity } from "@/lib/utils/format";

/** Результат одной инвентаризации: кто, когда, комментарий и каждая позиция «было → стало». */
export default function InventoryResultPage() {
  const params = useParams<{ id: string }>();
  const canInventory = useCan(Permission.STOCK_INVENTORY);
  const { data: doc, isLoading, isError, error } = useInventoryHistoryDetail(params.id, canInventory);

  if (!canInventory) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        Нет доступа: инвентаризация доступна только супер-админу.
      </p>
    );
  }
  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (isError || !doc) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/inventory?tab=history" className="text-sm text-muted hover:text-text">
          ‹ К истории инвентаризаций
        </Link>
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {apiErrorMessage(error, "Инвентаризация не найдена")}
        </p>
      </div>
    );
  }

  const delta = (ln: InventoryChange) => Number(ln.after) - Number(ln.before);
  const COLS = "grid grid-cols-[minmax(220px,1.8fr)_110px_110px_150px] items-center gap-3";
  const headCls = "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";

  return (
    <div className="flex flex-col gap-4">
      <Link href="/inventory?tab=history" className="text-sm text-muted hover:text-text">
        ‹ К истории инвентаризаций
      </Link>

      <Card>
        <h2 className="text-lg font-bold text-text">Инвентаризация от {formatDateTime(doc.created_at)}</h2>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <div className="text-xs font-semibold text-muted">Провёл</div>
            <div>{doc.created_by_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Позиций изменено</div>
            <div className="font-semibold">{doc.positions}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Приходов</div>
            <div className="font-semibold text-success">{doc.in_count}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Расходов</div>
            <div className="font-semibold text-danger">{doc.out_count}</div>
          </div>
        </div>
        {doc.comment && (
          <div className="mt-3 text-sm">
            <div className="text-xs font-semibold text-muted">Комментарий</div>
            <div>{doc.comment}</div>
          </div>
        )}
      </Card>

      <div className="glass flex flex-col rounded-3xl p-5">
        <h3 className="pb-4 text-[16px] font-bold tracking-tight text-text">Результат</h3>

        {/* Десктоп (lg+) — таблица «было → стало» */}
        <div className="hidden overflow-x-auto lg:block">
          <div className="min-w-[620px]">
            <div className={`${COLS} border-b border-black/[0.08] px-3 pb-2.5`}>
              <span className={headCls}>Наименование</span>
              <span className={`${headCls} text-right`}>Было</span>
              <span className={`${headCls} text-right`}>Стало</span>
              <span className={`${headCls} text-right`}>Разница</span>
            </div>
            {doc.lines.map((ln) => (
              <div key={`${ln.item_type}-${ln.item_id}`} className={`${COLS} rounded-2xl px-3 py-2.5 hover:bg-white/50`}>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate text-[13.5px] font-semibold text-text">{ln.name}</span>
                  {ln.item_type === ItemType.MATERIAL && (
                    <span className="shrink-0 rounded-full border border-border bg-white/60 px-2 py-0.5 text-[10.5px] font-semibold text-muted">
                      Сырьё
                    </span>
                  )}
                </span>
                <span className="text-right text-[13.5px] tabular-nums text-muted">
                  {formatQuantity(ln.before)} <span className="text-[11.5px]">{ln.unit}</span>
                </span>
                <span className="text-right text-[14px] font-bold tabular-nums text-text">
                  {formatQuantity(ln.after)} <span className="text-[11.5px] font-normal text-muted">{ln.unit}</span>
                </span>
                <span className="flex justify-end">
                  <DeltaPill delta={delta(ln)} unit={ln.unit} withKind />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Телефон/планшет (< lg) — карточки */}
        <MobileCardList
          rows={doc.lines}
          keyField={(ln) => `${ln.item_type}-${ln.item_id}`}
          emptyMessage="Позиций нет"
          renderCard={(ln) => (
            <div className="glass flex w-full flex-col gap-2 rounded-3xl p-4">
              <span className="break-words text-[13.5px] font-semibold leading-snug text-text">{ln.name}</span>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[13px] tabular-nums text-muted">
                  {formatQuantity(ln.before)} → <b className="text-text">{formatQuantity(ln.after)}</b> {ln.unit}
                </span>
                <DeltaPill delta={delta(ln)} unit={ln.unit} withKind />
              </div>
            </div>
          )}
        />

        <p className="mt-4 text-[12.5px] text-muted">
          Приходы и расходы этой инвентаризации — в{" "}
          <Link href="/stock" className="font-medium text-primary hover:underline">
            «Остатки → Движения»
          </Link>
          , источник «Инвентаризация». Название позиции записано на момент проведения.
        </p>
      </div>
    </div>
  );
}
