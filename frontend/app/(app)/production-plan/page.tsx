"use client";

import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Gift,
  Layers,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Timer,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TaskFormModal } from "@/components/productionPlan/TaskFormModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/lib/api/http";
import { useCan } from "@/lib/auth/permissions";
import {
  useDeleteTask,
  useMarkReady,
  useMarkShipped,
  useProductionPlan,
  useReorderTasks,
  useUpdatePlanSettings,
  useUpdateTask,
} from "@/lib/hooks/useProductionPlan";
import { Permission } from "@/lib/types/enums";
import {
  ProductionTaskStatus,
  type BobbinStatus,
  type ItemRow,
  type Offer,
  type PlanSettings,
  type TaskRow,
} from "@/lib/types/productionPlan";
import { formatDayMonth, formatNumber } from "@/lib/utils/format";

/**
 * План производства простыней — внутренняя очередь заданий супер-админа.
 *
 * Весь расчёт делает бэкенд (services/production_plan_service.py): сколько бабин
 * уйдёт на задание с учётом заданий выше по очереди, хватит ли их на складе,
 * когда задание будет готово при текущей выработке линии, и есть ли на складе
 * свободные готовые простыни, которые можно сразу закрепить за заданием.
 */

const BOBBIN_CHIP: Record<BobbinStatus, { label: string; className: string }> = {
  ok: { label: "Бабин хватает", className: "bg-success-bg text-success" },
  partial: { label: "Бабин частично", className: "bg-warning-bg text-warning" },
  none: { label: "Бабин нет", className: "bg-danger-bg text-danger" },
  no_norm: { label: "Нет нормы", className: "bg-slate-200 text-slate-700" },
  done: { label: "Всё собрано", className: "bg-success-bg text-success" },
};

const STATUS_LABEL: Record<ProductionTaskStatus, string> = {
  QUEUED: "В очереди",
  IN_PROGRESS: "В работе",
  DONE: "Отгружено",
  CANCELLED: "Отменено",
};

const DISMISSED_KEY = "production-plan:dismissed-offers";

/** «Нет» на предложении помним в браузере, пока не изменится свободный остаток. */
function offerKey(o: Offer) {
  return `${o.item_id}:${o.free}`;
}

function loadDismissed(): string[] {
  try {
    return JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveDismissed(keys: string[]) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(keys.slice(-50)));
  } catch {
    /* приватный режим — просто не запомним */
  }
}

const pcs = (n: number | string) => `${formatNumber(n)} шт`;

export default function ProductionPlanPage() {
  const canManage = useCan(Permission.PRODUCTION_PLAN_MANAGE);
  const plan = useProductionPlan(canManage);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const reorder = useReorderTasks();
  const markReady = useMarkReady();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [qtyAction, setQtyAction] = useState<QtyAction | null>(null);

  useEffect(() => setDismissed(loadDismissed()), []);

  const data = plan.data;
  const active = useMemo(
    () =>
      (data?.tasks ?? []).filter(
        (t) => t.status === ProductionTaskStatus.QUEUED || t.status === ProductionTaskStatus.IN_PROGRESS
      ),
    [data]
  );
  const closed = useMemo(() => (data?.tasks ?? []).filter((t) => !active.includes(t)), [data, active]);
  const offers = (data?.offers ?? []).filter((o) => !dismissed.includes(offerKey(o)));
  const shortage = (data?.bobbins ?? []).reduce((s, b) => s + b.shortage, 0);
  const lateCount = active.filter((t) => t.late).length;

  if (!canManage) {
    return <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">Нет доступа к плану производства</p>;
  }
  if (plan.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (plan.isError || !data) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {apiErrorMessage(plan.error, "Не удалось загрузить план")}
      </p>
    );
  }

  const onError = (err: unknown) => setActionError(apiErrorMessage(err, "Не удалось выполнить действие"));

  function move(index: number, step: -1 | 1) {
    const target = index + step;
    if (target < 0 || target >= active.length) return;
    const ids = active.map((t) => t.id);
    ids.splice(target, 0, ...ids.splice(index, 1));
    setActionError(null);
    reorder.mutate(ids, { onError });
  }

  function setStatus(task: TaskRow, status: ProductionTaskStatus) {
    setActionError(null);
    updateTask.mutate({ id: task.id, data: { status } }, { onError });
  }

  function remove(task: TaskRow) {
    const what = task.client_name ? `для «${task.client_name}»` : `«${task.items[0]?.product_name ?? ""}»`;
    if (!window.confirm(`Удалить задание ${what} — ${pcs(task.quantity)}?`)) return;
    setActionError(null);
    deleteTask.mutate(task.id, { onError });
  }

  function acceptOffer(o: Offer) {
    setActionError(null);
    markReady.mutate({ taskId: o.task_id, itemId: o.item_id, quantity: o.quantity }, { onError });
  }

  function declineOffer(o: Offer) {
    const next = [...dismissed, offerKey(o)];
    setDismissed(next);
    saveDismissed(next);
  }

  const busy = reorder.isPending || updateTask.isPending || deleteTask.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-white/60 px-3 py-2 text-[13px] text-muted hover:bg-white/80"
        >
          <Settings2 className="h-4 w-4" />
          Выработка: <b className="text-text">{pcs(data.settings.sheets_per_shift)}</b> за смену ·{" "}
          <b className="text-text">{data.settings.shifts_per_day}</b> смены в сутки
        </button>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Новое задание
        </Button>
      </div>

      {offers.map((o) => (
        <div
          key={offerKey(o)}
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-success/30 bg-success-bg px-4 py-3"
        >
          <Gift className="h-5 w-5 shrink-0 text-success" />
          <p className="min-w-0 flex-1 text-[13.5px] text-text">
            Есть свободных <b>{pcs(o.free)}</b> «{o.product_name}».{" "}
            {o.client_name ? (
              <>
                Можем передать клиенту <b>«{o.client_name}»</b> — {pcs(o.quantity)}?
              </>
            ) : (
              <>Закрепить {pcs(o.quantity)} за заданием без клиента?</>
            )}
          </p>
          <div className="flex gap-2">
            <Button variant="success" size="sm" onClick={() => acceptOffer(o)} disabled={markReady.isPending}>
              <Check className="h-4 w-4" /> Да
            </Button>
            <Button variant="secondary" size="sm" onClick={() => declineOffer(o)}>
              Нет
            </Button>
          </div>
        </div>
      ))}

      {actionError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">{actionError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label="Осталось сделать" value={pcs(data.total_remaining)} icon={Layers} />
        <KpiCard
          label="Смен работы"
          value={formatNumber(data.total_shifts, 1)}
          icon={Timer}
          tone="neutral"
          hint={<span className="text-muted">по {pcs(data.settings.sheets_per_shift)} за смену</span>}
        />
        <KpiCard
          label="Очередь закроется"
          value={data.finish_date ? formatDayMonth(data.finish_date) : "—"}
          icon={CalendarClock}
          tone={lateCount ? "danger" : "success"}
          hint={
            lateCount ? (
              <span className="text-danger">Не успеваем к сроку: {lateCount}</span>
            ) : (
              <span className="text-muted">ориентировочно</span>
            )
          }
        />
        <KpiCard
          label="Бабин не хватает"
          value={formatNumber(shortage)}
          icon={Layers}
          tone={shortage ? "danger" : "success"}
          hint={<span className="text-muted">на всю очередь</span>}
        />
      </div>

      {data.bobbins.length > 0 && (
        <Card title="Бабины на очередь">
          <div className="flex flex-col divide-y divide-border">
            {data.bobbins.map((b) => (
              <div key={b.bobbin_id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13px]">
                <div className="min-w-0">
                  <div className="font-semibold text-text">{b.name}</div>
                  <div className="text-muted">норма {pcs(b.roll_norm)} с бабины</div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 tabular-nums">
                  <span>
                    нужно <b>{formatNumber(b.needed, 2)}</b>
                  </span>
                  <span>
                    на складе <b>{formatNumber(b.on_stock, 0)}</b>
                  </span>
                  {b.shortage > 0 ? (
                    <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">
                      не хватает {b.shortage}
                    </span>
                  ) : (
                    <span className="rounded-full bg-success-bg px-2 py-0.5 font-semibold text-success">хватает</span>
                  )}
                  {b.leftover_sheets > 0 && (
                    <span className="text-muted">с последней бабины останется ≈ {pcs(b.leftover_sheets)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title={`Очередь (${active.length})`}>
        {active.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Заданий нет — добавьте первое.</p>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {active.map((t, i) => (
              <TaskCard
                key={t.id}
                task={t}
                index={i}
                isLast={i === active.length - 1}
                busy={busy}
                onMove={move}
                onEdit={() => {
                  setEditing(t);
                  setFormOpen(true);
                }}
                onReady={(item) => setQtyAction({ kind: "ready", task: t, item })}
                onShip={(item) => setQtyAction({ kind: "ship", task: t, item })}
                onCancel={() => setStatus(t, ProductionTaskStatus.CANCELLED)}
                onDelete={() => remove(t)}
              />
            ))}
          </ol>
        )}
      </Card>

      {closed.length > 0 && (
        <Card
          title={`Закрытые (${closed.length})`}
          action={
            <Button variant="ghost" size="sm" onClick={() => setShowClosed((v) => !v)}>
              {showClosed ? "Скрыть" : "Показать"}
            </Button>
          }
        >
          {showClosed && (
            <div className="flex flex-col divide-y divide-border">
              {closed.map((t) => (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-[13px]">
                  <div className="min-w-0">
                    <span className="font-semibold text-text">{t.client_name || "Без клиента"}</span>
                    <span className="text-muted">
                      {" "}
                      · {t.items.map((i) => `${i.product_name} ${pcs(i.quantity)}`).join(", ")} · отгружено{" "}
                      {pcs(t.shipped)} из {pcs(t.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        t.status === ProductionTaskStatus.DONE
                          ? "bg-success-bg text-success"
                          : "bg-slate-200 text-slate-700"
                      )}
                    >
                      {STATUS_LABEL[t.status]}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStatus(t, ProductionTaskStatus.QUEUED)}
                      disabled={busy}
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> В очередь
                    </Button>
                    <button
                      type="button"
                      onClick={() => remove(t)}
                      className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                      aria-label="Удалить"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} task={editing} settings={data.settings} />
      <QuantityModal action={qtyAction} onClose={() => setQtyAction(null)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={data.settings} />
    </div>
  );
}

interface TaskCardProps {
  task: TaskRow;
  index: number;
  isLast: boolean;
  busy: boolean;
  onMove: (index: number, step: -1 | 1) => void;
  onEdit: () => void;
  onReady: (item: ItemRow) => void;
  onShip: (item: ItemRow) => void;
  onCancel: () => void;
  onDelete: () => void;
}

/** Состояние отгрузки задания целиком — его видно сразу в шапке карточки. */
function shippingBadge(t: TaskRow) {
  if (t.shipped === 0) return null;
  if (t.shipped >= t.quantity) return { label: "Отгружено полностью", className: "bg-success-bg text-success" };
  return {
    label: `Отгружено частично: ${pcs(t.shipped)} из ${pcs(t.quantity)}`,
    className: "bg-warning-bg text-warning",
  };
}

function TaskCard({ task: t, index, isLast, busy, onMove, onEdit, onReady, onShip, onCancel, onDelete }: TaskCardProps) {
  const badge = shippingBadge(t);

  return (
    <li className="rounded-2xl border border-border bg-white/55 p-3.5">
      <div className="flex gap-3">
        <div className="flex flex-col items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={busy || index === 0}
            className="rounded-lg p-1 text-muted hover:bg-primary-50 hover:text-primary disabled:opacity-30"
            aria-label="Выше"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <span className="text-[13px] font-bold tabular-nums text-text">{index + 1}</span>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={busy || isLast}
            className="rounded-lg p-1 text-muted hover:bg-primary-50 hover:text-primary disabled:opacity-30"
            aria-label="Ниже"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[14.5px] font-bold text-text">{t.client_name || "Без клиента"}</div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px] text-muted">
                <span>
                  {t.items.length > 1 ? `${t.items.length} позиции · ` : ""}
                  {pcs(t.quantity)}
                </span>
                {t.eta && (
                  <span className={clsx("tabular-nums", t.late && "font-semibold text-danger")}>
                    · готово ≈ {formatDayMonth(t.eta)}
                  </span>
                )}
                {t.deadline && (
                  <span className={clsx(t.late && "font-semibold text-danger")}>· срок {formatDayMonth(t.deadline)}</span>
                )}
                {badge && (
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", badge.className)}>
                    {badge.label}
                  </span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg p-1.5 text-muted hover:bg-primary-50 hover:text-primary"
                aria-label="Изменить"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={busy}
                className="rounded-lg p-1.5 text-muted hover:bg-bg hover:text-text"
                aria-label="Отменить задание"
                title="Отменить задание"
              >
                <X className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
                aria-label="Удалить"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex flex-col gap-2">
            {t.items.map((i) => (
              <ItemLine key={i.id} item={i} onReady={() => onReady(i)} onShip={() => onShip(i)} />
            ))}
          </div>

          {t.comment && <p className="mt-2 text-[12.5px] text-muted">{t.comment}</p>}
        </div>
      </div>
    </li>
  );
}

function ItemLine({ item: i, onReady, onShip }: { item: ItemRow; onReady: () => void; onShip: () => void }) {
  const chip = i.bobbin_status ? BOBBIN_CHIP[i.bobbin_status] : null;
  const shippedPct = Math.min(i.shipped / i.quantity, 1) * 100;
  const waitingPct = Math.min(i.awaiting_shipment / i.quantity, 1) * 100;

  return (
    <div className="rounded-xl bg-white/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13.5px] font-semibold text-text">{i.product_name}</span>
        <div className="flex gap-1.5">
          {i.remaining > 0 && (
            <Button variant="secondary" size="sm" onClick={onReady}>
              <PackageCheck className="h-3.5 w-3.5" /> Готово
            </Button>
          )}
          {i.awaiting_shipment > 0 && (
            <Button variant="success" size="sm" onClick={onShip}>
              <Truck className="h-3.5 w-3.5" /> Отгрузить
            </Button>
          )}
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] tabular-nums">
        <span className="text-muted">
          заказано <b className="text-text">{pcs(i.quantity)}</b>
        </span>
        <span className="text-muted">
          готово <b className="text-text">{pcs(i.ready)}</b>
        </span>
        <span className="text-muted">
          отгружено <b className="text-text">{pcs(i.shipped)}</b>
        </span>
        {i.awaiting_shipment > 0 && <span className="text-success">ждёт отгрузки {pcs(i.awaiting_shipment)}</span>}
        <span className="ml-auto font-semibold text-text">
          {i.remaining > 0 ? `осталось сделать ${pcs(i.remaining)}` : "всё сделано"}
        </span>
      </div>
      <div
        className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-border"
        title={`Отгружено ${pcs(i.shipped)}, ждёт отгрузки ${pcs(i.awaiting_shipment)}, осталось сделать ${pcs(i.remaining)}`}
      >
        <div className="h-full bg-success" style={{ width: `${shippedPct}%` }} />
        <div className="h-full bg-success/40" style={{ width: `${waitingPct}%` }} />
      </div>

      {i.orders.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          <span>по заказам:</span>
          {i.orders.map((o) => (
            <Link key={o.order_id} href={`/orders/${o.order_id}`} className="font-medium text-primary hover:underline">
              {o.order_number} — {pcs(o.quantity)}
            </Link>
          ))}
          {i.shipped > i.orders.reduce((s, o) => s + o.quantity, 0) && (
            <span>
              вручную — {pcs(i.shipped - i.orders.reduce((s, o) => s + o.quantity, 0))}
            </span>
          )}
        </div>
      )}

      {(chip || i.bobbins_needed !== null || i.shifts_needed !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
          {chip && <span className={clsx("rounded-full px-2 py-0.5 font-semibold", chip.className)}>{chip.label}</span>}
          {i.bobbins_needed !== null && (
            <span className="tabular-nums">
              бабин <b>{formatNumber(i.bobbins_needed, 2)}</b>
              {i.plan_bobbin_name && <span className="text-muted"> · {i.plan_bobbin_name}</span>}
              {i.bobbins_short && <span className="text-danger"> · не хватает {formatNumber(i.bobbins_short, 2)}</span>}
            </span>
          )}
          {i.shifts_needed !== null && (
            <span className="tabular-nums text-muted">≈ {formatNumber(i.shifts_needed, 1)} смены</span>
          )}
          {i.eta && <span className="tabular-nums text-muted">готово ≈ {formatDayMonth(i.eta)}</span>}
        </div>
      )}
    </div>
  );
}

interface QtyAction {
  kind: "ready" | "ship";
  task: TaskRow;
  item: ItemRow;
}

/** «Готово» / «Отгрузить»: сколько штук отметить по позиции. */
function QuantityModal({ action, onClose }: { action: QtyAction | null; onClose: () => void }) {
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
  const who = task.client_name ? `«${task.client_name}»` : "задания";

  function submit() {
    if (!action) return;
    const n = Number(value);
    if (!Number.isInteger(n) || n <= 0) return setError("Целое число больше нуля");
    if (n > max) return setError(`Не больше ${pcs(max)}`);
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
              Сколько готовых простыней «{item.product_name}» отложить для {who}? Они закрепятся за клиентом и
              перестанут считаться свободными на складе.
            </>
          ) : (
            <>
              Сколько простыней «{item.product_name}» отгрузили для {who}? Это ручная отметка — склад и долг
              клиента она не меняет. Если оформить отгрузку заказом на странице «Заказы», она засчитается сюда
              сама и спишется со склада.
            </>
          )}
        </p>
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Штук (можно до {pcs(max)})</label>
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

function SettingsModal({ open, onClose, settings }: { open: boolean; onClose: () => void; settings: PlanSettings }) {
  const save = useUpdatePlanSettings();
  const [perShift, setPerShift] = useState("");
  const [perDay, setPerDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPerShift(String(settings.sheets_per_shift));
    setPerDay(String(settings.shifts_per_day));
    setError(null);
  }, [open, settings]);

  function submit() {
    const a = Number(perShift);
    const b = Number(perDay);
    if (!Number.isInteger(a) || a <= 0 || !Number.isInteger(b) || b <= 0 || b > 3) {
      return setError("Целые числа: штук за смену больше нуля, смен в сутки от 1 до 3");
    }
    save.mutate(
      { sheets_per_shift: a, shifts_per_day: b },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err, "Не удалось сохранить")) }
    );
  }

  const input =
    "w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <Modal open={open} onClose={onClose} title="Выработка линии" size="md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Простыней за 12-ч смену</label>
            <input type="number" min="1" value={perShift} onChange={(e) => setPerShift(e.target.value)} className={input} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Смен в сутки</label>
            <input type="number" min="1" max="3" value={perDay} onChange={(e) => setPerDay(e.target.value)} className={input} />
          </div>
        </div>
        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={submit} disabled={save.isPending}>
            {save.isPending ? "Сохранение…" : "Сохранить"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
