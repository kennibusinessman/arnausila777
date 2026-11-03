"use client";

import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
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
import { Fragment, useEffect, useMemo, useState } from "react";
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
  type BobbinNeed,
  type BobbinStatus,
  type BobbinUse,
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
  // Раскрытые задания очереди; по умолчанию всё свёрнуто в одну строку.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

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
  const allOpen = active.length > 0 && active.every((t) => expanded.has(t.id));

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Из раскладки бабин — раскрыть задание в очереди и прокрутить к нему. */
  function jumpTo(taskId: string) {
    setExpanded((prev) => new Set(prev).add(taskId));
    requestAnimationFrame(() =>
      document.getElementById(`task-${taskId}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
    );
  }

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
          label="Бабин докупить"
          value={formatNumber(shortage)}
          icon={Layers}
          tone={shortage ? "danger" : "success"}
          hint={<span className="text-muted">на всю очередь</span>}
        />
      </div>

      {data.bobbins.length > 0 && <BobbinsCard bobbins={data.bobbins} onJump={jumpTo} />}

      <Card
        title={`Очередь (${active.length})`}
        action={
          active.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(allOpen ? new Set() : new Set(active.map((t) => t.id)))}
            >
              {allOpen ? "Свернуть все" : "Развернуть все"}
            </Button>
          )
        }
      >
        {active.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">Заданий нет — добавьте первое.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {active.map((t, i) => (
              <TaskCard
                key={t.id}
                task={t}
                index={i}
                isLast={i === active.length - 1}
                busy={busy}
                expanded={expanded.has(t.id)}
                onToggle={() => toggle(t.id)}
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

/** Худшее состояние бабин среди позиций — им окрашена свёрнутая строка задания. */
const BOBBIN_RANK: Record<BobbinStatus, number> = { none: 4, partial: 3, no_norm: 2, ok: 1, done: 0 };

function taskBobbins(t: TaskRow) {
  let worst: BobbinStatus | null = null;
  let short = 0;
  for (const i of t.items) {
    if (i.bobbin_status && (worst === null || BOBBIN_RANK[i.bobbin_status] > BOBBIN_RANK[worst])) {
      worst = i.bobbin_status;
    }
    short += Number(i.bobbins_short ?? 0);
  }
  return { worst, short };
}

/** Состояние отгрузки задания целиком. */
function shippingBadge(t: TaskRow) {
  if (t.shipped === 0) return null;
  if (t.shipped >= t.quantity) return { label: "Отгружено полностью", className: "bg-success-bg text-success" };
  return {
    label: `Отгружено ${pcs(t.shipped)} из ${pcs(t.quantity)}`,
    className: "bg-warning-bg text-warning",
  };
}

interface TaskCardProps {
  task: TaskRow;
  index: number;
  isLast: boolean;
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onMove: (index: number, step: -1 | 1) => void;
  onEdit: () => void;
  onReady: (item: ItemRow) => void;
  onShip: (item: ItemRow) => void;
  onCancel: () => void;
  onDelete: () => void;
}

function TaskCard({
  task: t,
  index,
  isLast,
  busy,
  expanded,
  onToggle,
  onMove,
  onEdit,
  onReady,
  onShip,
  onCancel,
  onDelete,
}: TaskCardProps) {
  const badge = shippingBadge(t);
  const { worst, short } = taskBobbins(t);
  const chip = worst ? BOBBIN_CHIP[worst] : null;
  const names = t.items.map((i) => i.product_name).join(", ");

  return (
    <li
      id={`task-${t.id}`}
      className={clsx(
        "scroll-mt-24 rounded-2xl border bg-white/55",
        worst === "none" ? "border-danger/30" : worst === "partial" ? "border-warning/40" : "border-border"
      )}
    >
      <div className="flex items-center gap-2 px-2.5 py-2">
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={busy || index === 0}
            className="rounded-lg p-1 text-muted hover:bg-primary-50 hover:text-primary disabled:opacity-30"
            aria-label="Выше"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
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

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-1.5 py-1 text-left hover:bg-white/60"
        >
          <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
            <span className="w-6 shrink-0 text-[13px] font-bold tabular-nums text-muted">{index + 1}</span>
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-bold text-text">{t.client_name || "Без клиента"}</span>
              <span className="block truncate text-[12px] text-muted">{names}</span>
            </span>
          </span>
          <span className="shrink-0 text-right text-[13px] tabular-nums">
            <b className="text-text">{pcs(t.remaining)}</b>
            {t.remaining !== t.quantity && <span className="text-muted"> из {pcs(t.quantity)}</span>}
          </span>
          {chip && (
            <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", chip.className)}>
              {worst === "none" || worst === "partial" ? `не хватает бабин: ${formatNumber(short)}` : chip.label}
            </span>
          )}
          {badge && (
            <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", badge.className)}>
              {badge.label}
            </span>
          )}
          <span className={clsx("shrink-0 text-[12.5px] tabular-nums", t.late ? "font-semibold text-danger" : "text-muted")}>
            {t.eta ? `≈ ${formatDayMonth(t.eta)}` : ""}
            {t.deadline && ` · срок ${formatDayMonth(t.deadline)}`}
          </span>
          <ChevronDown
            className={clsx("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")}
          />
        </button>
      </div>

      {expanded && (
        <div className="border-t border-border px-3.5 pb-3 pt-2.5">
          <div className="flex flex-col gap-2">
            {t.items.map((i) => (
              <ItemLine key={i.id} item={i} onReady={() => onReady(i)} onShip={() => onShip(i)} />
            ))}
          </div>
          {t.comment && <p className="mt-2 text-[12.5px] text-muted">{t.comment}</p>}
          <div className="mt-2.5 flex flex-wrap justify-end gap-1.5">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Изменить
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel} disabled={busy}>
              <X className="h-3.5 w-3.5" /> Отменить задание
            </Button>
            <button
              type="button"
              onClick={onDelete}
              className="rounded-lg p-1.5 text-muted hover:bg-danger-bg hover:text-danger"
              aria-label="Удалить"
              title="Удалить задание"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function ItemLine({ item: i, onReady, onShip }: { item: ItemRow; onReady: () => void; onShip: () => void }) {
  const chip = i.bobbin_status ? BOBBIN_CHIP[i.bobbin_status] : null;
  const shippedPct = Math.min(i.shipped / i.quantity, 1) * 100;
  const waitingPct = Math.min(i.awaiting_shipment / i.quantity, 1) * 100;
  const fromOrders = i.orders.reduce((s, o) => s + o.quantity, 0);

  return (
    <div className="rounded-xl bg-white/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13.5px] font-semibold text-text">{i.product_name}</span>
          <span className="ml-2 text-[12.5px] tabular-nums text-muted">
            {i.remaining > 0 ? (
              <>
                осталось <b className="text-text">{pcs(i.remaining)}</b>
                {i.remaining !== i.quantity && ` из ${pcs(i.quantity)}`}
              </>
            ) : (
              <>всё сделано · {pcs(i.quantity)}</>
            )}
          </span>
        </div>
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

      {i.ready > 0 && (
        <>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[12.5px] tabular-nums text-muted">
            <span>
              готово <b className="text-text">{pcs(i.ready)}</b>
            </span>
            <span>
              отгружено <b className="text-text">{pcs(i.shipped)}</b>
            </span>
            {i.awaiting_shipment > 0 && <span className="text-success">ждёт отгрузки {pcs(i.awaiting_shipment)}</span>}
          </div>
          <div
            className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-border"
            title={`Отгружено ${pcs(i.shipped)}, ждёт отгрузки ${pcs(i.awaiting_shipment)}, осталось сделать ${pcs(i.remaining)}`}
          >
            <div className="h-full bg-success" style={{ width: `${shippedPct}%` }} />
            <div className="h-full bg-success/40" style={{ width: `${waitingPct}%` }} />
          </div>
        </>
      )}

      {i.orders.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
          <span>по заказам:</span>
          {i.orders.map((o) => (
            <Link key={o.order_id} href={`/orders/${o.order_id}`} className="font-medium text-primary hover:underline">
              {o.order_number} — {pcs(o.quantity)}
            </Link>
          ))}
          {i.shipped > fromOrders && <span>вручную — {pcs(i.shipped - fromOrders)}</span>}
        </div>
      )}

      {(chip || i.bobbins_needed !== null || i.shifts_needed !== null) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
          {chip && <span className={clsx("rounded-full px-2 py-0.5 font-semibold", chip.className)}>{chip.label}</span>}
          {i.bobbins_needed !== null && (
            <span className="tabular-nums">
              {i.plan_bobbin_name ?? "бабин"} — <b>{pcs(i.bobbins_needed)}</b>
              {i.bobbins_short ? <span className="text-danger"> · не хватает {pcs(i.bobbins_short)}</span> : null}
            </span>
          )}
          {i.leftover_sheets ? (
            <span className="tabular-nums text-muted">лишнее ≈ {pcs(i.leftover_sheets)} останется на складе</span>
          ) : null}
          {i.shifts_needed !== null && (
            <span className="tabular-nums text-muted">≈ {formatNumber(i.shifts_needed, 1)} смены</span>
          )}
          {i.eta && <span className="tabular-nums text-muted">готово ≈ {formatDayMonth(i.eta)}</span>}
        </div>
      )}
    </div>
  );
}

type BobbinSort = "clients" | "colors" | "names";

const BOBBIN_SORTS: { key: BobbinSort; label: string }[] = [
  { key: "clients", label: "По клиентам" },
  { key: "colors", label: "По цветам" },
  { key: "names", label: "По наименованию" },
];

const SORT_KEY = "production-plan:bobbin-sort";
const NO_COLOR = "Без цвета";

function loadSort(): BobbinSort {
  try {
    const v = localStorage.getItem(SORT_KEY);
    if (v === "clients" || v === "colors" || v === "names") return v;
  } catch {
    /* приватный режим — по умолчанию */
  }
  return "clients";
}

/** Строка раскладки: позиция очереди + бабина, которую она берёт. */
interface UseRow extends BobbinUse {
  bobbin: BobbinNeed;
}

interface BobbinGroup {
  key: string;
  title: string;
  subtitle: string;
  needed: number;
  /** На складе — только там, где группа = конкретные бабины (цвет, наименование). */
  onStock: number | null;
  short: number;
  rows: UseRow[];
}

const sumBy = (rows: UseRow[], f: (r: UseRow) => number) => rows.reduce((s, r) => s + f(r), 0);

function buildGroups(bobbins: BobbinNeed[], sort: BobbinSort): BobbinGroup[] {
  const rows: UseRow[] = bobbins.flatMap((b) => b.uses.map((u) => ({ ...u, bobbin: b })));
  const byQueue = (a: UseRow, b: UseRow) => a.queue_no - b.queue_no;

  if (sort === "names") {
    return bobbins.map((b) => {
      const rs = rows.filter((r) => r.bobbin.bobbin_id === b.bobbin_id).sort(byQueue);
      return {
        key: b.bobbin_id,
        title: b.name,
        subtitle: `норма ${pcs(b.roll_norm)} простыней с бабины · заданий ${rs.length}`,
        needed: b.needed,
        onStock: Number(b.on_stock),
        short: b.shortage,
        rows: rs,
      };
    });
  }

  if (sort === "colors") {
    const colors = new Map<string, BobbinNeed[]>();
    for (const b of bobbins) {
      const c = b.color ?? NO_COLOR;
      colors.set(c, [...(colors.get(c) ?? []), b]);
    }
    return [...colors.entries()]
      .sort(([a], [b]) => (a === NO_COLOR ? 1 : b === NO_COLOR ? -1 : a.localeCompare(b, "ru")))
      .map(([color, bs]) => {
        const ids = new Set(bs.map((b) => b.bobbin_id));
        const rs = rows.filter((r) => ids.has(r.bobbin.bobbin_id)).sort(byQueue);
        return {
          key: `color:${color}`,
          title: color,
          subtitle: bs.map((b) => (bs.length > 1 ? `${b.name} — на складе ${formatNumber(b.on_stock, 0)}` : b.name)).join(" · "),
          needed: sumBy(rs, (r) => r.needed),
          onStock: bs.reduce((s, b) => s + Number(b.on_stock), 0),
          short: sumBy(rs, (r) => r.short),
          rows: rs,
        };
      });
  }

  // По клиентам: задание = группа, в порядке очереди.
  const tasks = new Map<string, UseRow[]>();
  for (const r of [...rows].sort(byQueue)) tasks.set(r.task_id, [...(tasks.get(r.task_id) ?? []), r]);
  return [...tasks.entries()].map(([taskId, rs]) => ({
    key: `task:${taskId}`,
    title: `№${rs[0]!.queue_no} · ${rs[0]!.client_name || "Без клиента"}`,
    subtitle: [...new Set(rs.map((r) => r.product_name))].join(", "),
    needed: sumBy(rs, (r) => r.needed),
    onStock: null,
    short: sumBy(rs, (r) => r.short),
    rows: rs,
  }));
}

/**
 * Бабины на очередь: сколько целых бабин нужно каждому заданию, сколько из них
 * есть на складе (склад расходуется сверху вниз по очереди), сколько докупить и
 * сколько лишних простыней останется на складе из-за округления до целой бабины.
 */
function BobbinsCard({ bobbins, onJump }: { bobbins: BobbinNeed[]; onJump: (taskId: string) => void }) {
  const [sort, setSort] = useState<BobbinSort>("clients");
  const [open, setOpen] = useState<Set<string>>(new Set());
  useEffect(() => setSort(loadSort()), []);

  const groups = useMemo(() => buildGroups(bobbins, sort), [bobbins, sort]);
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.key));

  function choose(next: BobbinSort) {
    setSort(next);
    setOpen(new Set());
    try {
      localStorage.setItem(SORT_KEY, next);
    } catch {
      /* не запомним — не страшно */
    }
  }

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card
      title="Бабины на очередь"
      action={
        <Button variant="ghost" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}>
          {allOpen ? "Свернуть все" : "Развернуть все"}
        </Button>
      }
    >
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-xl bg-white/60 p-1" role="tablist" aria-label="Сортировка бабин">
        {BOBBIN_SORTS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={sort === s.key}
            onClick={() => choose(s.key)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              sort === s.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-white hover:text-text"
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const isOpen = open.has(g.key);
          const shortRows = g.rows.filter((r) => r.short > 0);
          const firstShort = sort === "names" ? g.rows.findIndex((r) => r.short > 0) : -1;
          return (
            <div
              key={g.key}
              className={clsx("rounded-xl border bg-white/50", g.short > 0 ? "border-danger/30" : "border-border")}
            >
              <button
                type="button"
                onClick={() => toggle(g.key)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 text-left text-[13px]"
              >
                <span className="min-w-0 flex-1 basis-48">
                  <span className="block font-semibold text-text">{g.title}</span>
                  <span className="block truncate text-[12px] text-muted">{g.subtitle}</span>
                </span>
                <span className="tabular-nums">
                  нужно бабин <b>{formatNumber(g.needed)}</b>
                </span>
                {g.onStock !== null && (
                  <span className="tabular-nums">
                    на складе <b>{formatNumber(g.onStock, 0)}</b>
                  </span>
                )}
                {g.short > 0 ? (
                  <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">
                    {g.onStock === null ? "не хватает" : "докупить"} {formatNumber(g.short)}
                  </span>
                ) : (
                  <span className="rounded-full bg-success-bg px-2 py-0.5 font-semibold text-success">хватает</span>
                )}
                <ChevronDown className={clsx("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>

              {!isOpen && shortRows.length > 0 && sort !== "clients" && (
                <p className="-mt-1 px-3.5 pb-2.5 text-[12px] text-danger">
                  не хватит: {shortRows.map((r) => `№${r.queue_no} ${r.client_name || "без клиента"}`).join(", ")}
                </p>
              )}

              {isOpen && (
                <div className="flex flex-col border-t border-border px-2 pb-2 pt-1">
                  {g.rows.map((r, n) => (
                    <Fragment key={`${r.item_id}:${r.bobbin.bobbin_id}`}>
                      {n === firstShort && n > 0 && (
                        <div className="flex items-center gap-2 px-2 py-1 text-[11.5px] font-semibold text-danger">
                          <span className="h-px flex-1 bg-danger/30" />
                          склад закончился
                          <span className="h-px flex-1 bg-danger/30" />
                        </div>
                      )}
                      <UseLine row={r} showClient={sort !== "clients"} onClick={() => onJump(r.task_id)} />
                    </Fragment>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function UseLine({ row: r, showClient, onClick }: { row: UseRow; showClient: boolean; onClick: () => void }) {
  const full = r.short === 0;
  const none = r.from_stock === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      title="Показать задание в очереди"
      className="flex w-full flex-col gap-1 rounded-lg px-2 py-2 text-left text-[13px] hover:bg-primary-50 sm:flex-row sm:items-center sm:gap-4"
    >
      <span className="min-w-0 flex-1">
        {showClient && (
          <span className="block text-[12px] font-semibold text-muted">
            №{r.queue_no} · {r.client_name || "Без клиента"}
          </span>
        )}
        <span className="block text-text">
          <span className="text-muted">Нужно:</span> {r.product_name} — <b>{pcs(r.sheets)}</b>, {r.bobbin.name} —{" "}
          <b>{pcs(r.needed)}</b>
        </span>
        {r.leftover_sheets > 0 && (
          <span className="block text-[12px] text-muted">
            Лишнее: ≈ {pcs(r.leftover_sheets)} простыней останется на складе
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-[12px] tabular-nums">
        <span
          className={clsx(
            "rounded-full px-2 py-0.5 font-semibold",
            full ? "bg-success-bg text-success" : none ? "bg-danger-bg text-danger" : "bg-warning-bg text-warning"
          )}
        >
          {full ? "✓ есть на складе" : none ? "✗ на складе нет" : `◐ со склада ${formatNumber(r.from_stock)}`}
        </span>
        {r.short > 0 && (
          <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">
            не хватает {pcs(r.short)}
          </span>
        )}
      </span>
    </button>
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
