"use client";

import { clsx } from "clsx";
import { Spinner } from "@/components/ui/Spinner";
import { useProductDemand } from "@/lib/hooks/useStock";
import type { DemandRow } from "@/lib/types/stock";
import { clientComment } from "@/lib/utils/clientComment";
import { formatDate, formatNumber } from "@/lib/utils/format";

/** Целые — без дробей, кг и т.п. — до двух знаков. */
function qty(v: string | number): string {
  const n = Number(v);
  return formatNumber(n, Number.isInteger(n) ? 0 : 2);
}

function RowStatus({ row, unit }: { row: DemandRow; unit: string }) {
  const short = Number(row.short);
  const from = Number(row.from_stock);
  if (short <= 0)
    return <span className="rounded-full bg-success-bg px-2 py-0.5 text-[11px] font-semibold text-success">хватает</span>;
  if (from > 0)
    return (
      <span className="rounded-full bg-warning-bg px-2 py-0.5 text-[11px] font-semibold text-warning">
        не хватает {qty(short)} {unit}
      </span>
    );
  return (
    <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger">
      нет на складе
    </span>
  );
}

/**
 * «Кому нужно» в поп-апе позиции остатков: все активные задания плана
 * производства, где нужно это наименование, — даже если склада не хватает.
 * Склад делится сверху вниз по очереди.
 */
export function ProductDemandList({ productId }: { productId: string }) {
  const { data, isLoading, isError } = useProductDemand(productId);

  if (isLoading)
    return (
      <div className="flex justify-center py-4">
        <Spinner />
      </div>
    );
  if (isError || !data)
    return <p className="text-[13px] text-danger">Не удалось загрузить, кому нужен товар</p>;

  const { unit } = data;
  const short = Number(data.short);
  // Место в очереди, где склад закончился, — рисуем разделитель.
  const firstShort = data.rows.findIndex((r) => Number(r.short) > 0 && Number(r.from_stock) <= 0);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[14px] font-bold text-text">Кому нужно</h4>
        {data.rows.length > 0 && (
          <span className="text-[12.5px] text-muted">
            всего <b className="text-text">{qty(data.needed)} {unit}</b> · на складе {qty(data.on_stock)}
            {short > 0 && (
              <>
                {" · "}
                <b className="text-danger">
                  не хватает {qty(short)} {unit}
                </b>
              </>
            )}
          </span>
        )}
      </div>

      {data.rows.length === 0 ? (
        <p className="rounded-2xl border border-white/60 bg-white/40 px-3 py-3 text-[13px] text-muted">
          Ни в одном задании плана производства этот товар сейчас не нужен.
        </p>
      ) : (
        <div className="flex max-h-[45vh] flex-col gap-1.5 overflow-y-auto">
          {data.rows.map((r, idx) => {
            const comment = clientComment(r.comment, r.client_name);
            return (
              <div key={`${r.task_id}-${idx}`}>
                {idx === firstShort && idx > 0 && (
                  <div className="my-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-danger">
                    <span className="h-px flex-1 bg-danger/30" />
                    склад закончился
                    <span className="h-px flex-1 bg-danger/30" />
                  </div>
                )}
                <div
                  className={clsx(
                    "flex items-center gap-3 rounded-2xl border px-3 py-2.5",
                    Number(r.short) > 0 ? "border-danger/20 bg-danger-bg/40" : "border-white/60 bg-white/40"
                  )}
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-[13.5px] font-semibold text-text">
                      {r.client_name ?? "На склад"}
                      {comment && <span className="font-normal text-muted"> — {comment}</span>}
                    </span>
                    <span className="text-[11.5px] text-muted">
                      №{r.queue_no} в очереди {r.kind === "SPUNBOND" ? "спанбонда" : "простыней"}
                      {r.via === "bobbin" && r.for_product_name && (
                        <> · на «{r.for_product_name}», {qty(r.sheets ?? 0)} шт</>
                      )}
                      {Number(r.ready) > 0 && <> · отложено {qty(r.ready)}</>}
                      {r.deadline && <> · до {formatDate(r.deadline)}</>}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[14px] font-bold tabular-nums text-text">
                      {qty(r.needed)}
                      <span className="text-[11px] font-medium text-muted"> {unit}</span>
                    </span>
                    <RowStatus row={r} unit={unit} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
