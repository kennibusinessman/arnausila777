"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { apiErrorMessage } from "@/lib/api/http";
import { useMarkReady, useMarkShipped } from "@/lib/hooks/useProductionPlan";
import type { ItemRow, TaskRow } from "@/lib/types/productionPlan";
import { formatNumber } from "@/lib/utils/format";

/** «шт» / «кг» — как у товара. */
export function unitLabel(unit: string | null | undefined): string {
  const u = (unit ?? "").trim().toLowerCase().replace(/\.$/, "");
  if (u === "kg" || u === "кг") return "кг";
  if (u === "" || u === "шт" || u === "pcs" || u === "roll") return "шт";
  return unit!.trim();
}

export interface QtyAction {
  kind: "ready" | "ship";
  task: TaskRow;
  item: ItemRow;
}

/** «Готово» / «Отгрузить»: сколько штук отметить по позиции. */
export function QuantityModal({ action, onClose }: { action: QtyAction | null; onClose: () => void }) {
  const markReady = useMarkReady();
  const markShipped = useMarkShipped();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const max = action ? (action.kind === "ready" ? action.item.remaining : action.item.awaiting_shipment) : 0;
  useEffect(() => {
    if (!action) return;
    setValue(String(max));
    setError(null);
  }, [action, max]);

  if (!action) return null;
  const { task, item } = action;
  const ready = action.kind === "ready";
  const u = unitLabel(item.unit);
  const qty = (n: number) => `${formatNumber(n)} ${u}`;
  const who = task.client_name ? `«${task.client_name}»` : "задания";

  function submit() {
    if (!action) return;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return setError("Целое число больше нуля");
    if (n > max) return setError(`Не больше ${qty(max)}`);
    const vars = { taskId: action.task.id, itemId: action.item.id, quantity: n };
    const opts = {
      onSuccess: onClose,
      onError: (err: unknown) => setError(apiErrorMessage(err, "Не удалось сохранить")),
    };
    if (action.kind === "ready") markReady.mutate(vars, opts);
    else markShipped.mutate(vars, opts);
  }

  const pending = markReady.isPending || markShipped.isPending;

  return (
    <Modal open onClose={onClose} title={ready ? "Готово для клиента" : "Отгрузка клиенту"} size="md">
      <div className="flex flex-col gap-4">
        <p className="text-[13.5px] text-text">
          {ready ? (
            <>
              Сколько готового «{item.product_name}» отложить для {who}? Это закрепится за клиентом и
              перестанет считаться свободным на складе.
            </>
          ) : (
            <>
              Сколько «{item.product_name}» отгрузили для {who}? Это ручная отметка — склад и долг
              клиента она не меняет. Если оформить отгрузку заказом на странице «Заказы», она засчитается сюда
              сама и спишется со склада.
            </>
          )}
        </p>
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Количество, {u} (можно до {qty(max)})</label>
          <input
            type="number"
            min="1"
            max={max}
            step="1"
            inputMode="numeric"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50"
          />
        </div>
        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            Отмена
          </Button>
          <Button variant={ready ? "primary" : "success"} onClick={submit} disabled={pending}>
            {pending ? "Сохранение…" : ready ? "Отметить готово" : "Отметить отгрузку"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
