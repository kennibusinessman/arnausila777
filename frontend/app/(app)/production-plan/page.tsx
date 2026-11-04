"use client";

import { clsx } from "clsx";
import {
  CalendarClock,
  Check,
  Gift,
  Layers,
  PackageCheck,
  Plus,
  RotateCcw,
  Settings2,
  Timer,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useState } from "react";
import { GroupHeader, ItemHead, Segmented, shortList, Swatch, TaskActions, TaskHeader } from "@/components/productionPlan/PlanParts";
import { QuantityModal, type QtyAction } from "@/components/productionPlan/QuantityModal";
import { SpunbondPlan } from "@/components/productionPlan/SpunbondPlan";
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
import { clientComment } from "@/lib/utils/clientComment";
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

type PlanLine = "SHEETS" | "SPUNBOND";

const LINES: { key: PlanLine; label: string; hint: string }[] = [
  { key: "SHEETS", label: "Простыни", hint: "из бабин" },
  { key: "SPUNBOND", label: "Спанбонд", hint: "из полипропилена" },
];

const LINE_KEY = "production-plan:line";

/** Страница плана: сначала выбираем линию — простыни или спанбонд. Выбор помним в браузере. */
export default function ProductionPlanPage() {
  const [line, setLine] = useState<PlanLine>("SHEETS");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LINE_KEY);
      if (saved === "SHEETS" || saved === "SPUNBOND") setLine(saved);
    } catch {
      /* приватный режим — по умолчанию простыни */
    }
  }, []);

  function choose(next: PlanLine) {
    setLine(next);
    try {
      localStorage.setItem(LINE_KEY, next);
    } catch {
      /* не запомним — не страшно */
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/60 p-1 sm:inline-grid sm:w-auto sm:self-start" role="tablist" aria-label="Линия">
        {LINES.map((l) => (
          <button
            key={l.key}
            type="button"
            role="tab"
            aria-selected={line === l.key}
            onClick={() => choose(l.key)}
            className={clsx(
              "flex flex-col items-center rounded-xl px-5 py-2 transition-colors sm:min-w-[160px]",
              line === l.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-white hover:text-text"
            )}
          >
            <span className="text-[14px] font-bold">{l.label}</span>
            <span className={clsx("text-[11.5px]", line === l.key ? "text-white/80" : "text-muted")}>{l.hint}</span>
          </button>
        ))}
      </div>
      {line === "SHEETS" ? <SheetsPlan /> : <SpunbondPlan />}
    </div>
  );
}

/** План простыней: очередь заданий, бабины, отгрузки. */
function SheetsPlan() {
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
          <div className="flex w-full gap-2 sm:w-auto [&>*]:flex-1 [&>*]:justify-center sm:[&>*]:flex-none">
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

      <TaskFormModal open={formOpen} onClose={() => setFormOpen(false)} task={editing}
        perShift={data.settings.sheets_per_shift}
      />
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
      <TaskHeader
        index={index}
        client={t.client_name || "Без клиента"}
        comment={clientComment(t.comment, t.client_name)}
        names={names}
        expanded={expanded}
        onToggle={onToggle}
        amount={
          <>
            <b className="text-text">{pcs(t.remaining)}</b>
            {t.remaining !== t.quantity && <span className="text-muted"> из {pcs(t.quantity)}</span>}
          </>
        }
        meta={
          <>
            {chip && (
              <span className={clsx("rounded-full px-2 py-0.5 text-[12px] font-semibold", chip.className)}>
                {worst === "none" || worst === "partial" ? `не хватает бабин: ${formatNumber(short)}` : chip.label}
              </span>
            )}
            {badge && (
              <span className={clsx("rounded-full px-2 py-0.5 text-[12px] font-semibold", badge.className)}>{badge.label}</span>
            )}
            {(t.eta || t.deadline) && (
              <span className={clsx("text-[12.5px] tabular-nums", t.late ? "font-semibold text-danger" : "text-muted")}>
                {t.eta ? `≈ ${formatDayMonth(t.eta)}` : ""}
                {t.deadline && ` · срок ${formatDayMonth(t.deadline)}`}
              </span>
            )}
          </>
        }
      />

      {expanded && (
        <div className="border-t border-border px-3.5 pb-3 pt-2.5">
          <div className="flex flex-col gap-2">
            {t.items.map((i) => (
              <ItemLine key={i.id} item={i} onReady={() => onReady(i)} onShip={() => onShip(i)} />
            ))}
          </div>
          <TaskActions
            index={index}
            isLast={isLast}
            busy={busy}
            onMove={onMove}
            onEdit={onEdit}
            onCancel={onCancel}
            onDelete={onDelete}
          />
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
      <ItemHead
        name={i.product_name}
        sub={
          i.remaining > 0 ? (
            <>
              осталось <b className="text-text">{pcs(i.remaining)}</b>
              {i.remaining !== i.quantity && ` из ${pcs(i.quantity)}`}
            </>
          ) : (
            <>всё сделано · {pcs(i.quantity)}</>
          )
        }
        actions={
          (i.remaining > 0 || i.awaiting_shipment > 0) && (
            <>
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
            </>
          )
        }
      />

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

type BobbinView = "all" | "short";

const NO_COLOR = "Без цвета";

/** Позиция очереди + бабина, которую она берёт. */
interface UseRow extends BobbinUse {
  bobbin: BobbinNeed;
}

interface BobbinBlock {
  bobbin: BobbinNeed;
  rows: UseRow[];
}

interface ColorGroup {
  key: string;
  color: string | null;
  needed: number;
  onStock: number;
  short: number;
  clients: string[];
  blocks: BobbinBlock[];
}

const who = (r: BobbinUse) => {
  const c = clientComment(r.comment, r.client_name);
  return `${r.client_name || "без клиента"}${c ? ` (${c})` : ""}`;
};

/** Бабины по цветам; внутри цвета — по наименованию бабины, внутри — позиции по очереди. */
function buildColorGroups(bobbins: BobbinNeed[], view: BobbinView): ColorGroup[] {
  const groups = new Map<string, ColorGroup>();
  for (const b of bobbins) {
    const rows = b.uses
      .map((u) => ({ ...u, bobbin: b }))
      .filter((r) => view === "all" || r.short > 0)
      .sort((x, y) => x.queue_no - y.queue_no);
    if (rows.length === 0) continue;
    const key = b.color ?? NO_COLOR;
    const g = groups.get(key) ?? { key, color: b.color, needed: 0, onStock: 0, short: 0, clients: [], blocks: [] };
    g.needed += b.needed;
    g.onStock += Number(b.on_stock);
    g.short += b.shortage;
    g.blocks.push({ bobbin: b, rows });
    for (const r of rows) if (!g.clients.includes(who(r))) g.clients.push(who(r));
    groups.set(key, g);
  }
  // Где не хватает — сверху, дальше по объёму; «без цвета» — в конце.
  return [...groups.values()].sort(
    (a, b) =>
      Number(a.color === null) - Number(b.color === null) ||
      Number(b.short > 0) - Number(a.short > 0) ||
      b.needed - a.needed ||
      (a.color ?? "").localeCompare(b.color ?? "", "ru")
  );
}

/**
 * Бабины на очередь — в том же виде, что «План по цветам» у спанбонда: цвет →
 * бабина (нужно / на складе) → кому сколько по очереди. Склад расходуется сверху
 * вниз; лишние простыни из-за округления до целой бабины остаются на складе.
 */
function BobbinsCard({ bobbins, onJump }: { bobbins: BobbinNeed[]; onJump: (taskId: string) => void }) {
  const [view, setView] = useState<BobbinView>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());

  const groups = useMemo(() => buildColorGroups(bobbins, view), [bobbins, view]);
  const anyShort = bobbins.some((b) => b.shortage > 0);
  const allOpen = groups.length > 0 && groups.every((g) => open.has(g.key));

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
        groups.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(groups.map((g) => g.key)))}>
            {allOpen ? "Свернуть все" : "Развернуть все"}
          </Button>
        )
      }
    >
      <Segmented
        options={[
          { key: "all", label: "Все задания", short: "Все" },
          { key: "short", label: "Только где не хватает", short: "Не хватает" },
        ]}
        value={view}
        onChange={setView}
        ariaLabel="Что показывать"
      />
      {!anyShort && <p className="mb-2 text-[12.5px] text-muted">Бабин на складе хватает на всю очередь.</p>}

      <div className="flex flex-col gap-2">
        {groups.map((g) => {
          const isOpen = open.has(g.key);
          return (
            <div
              key={g.key}
              className={clsx("rounded-xl border bg-white/50", g.short > 0 ? "border-danger/30" : "border-border")}
            >
              <GroupHeader
                lead={<Swatch color={g.color} />}
                title={g.color ?? NO_COLOR}
                subtitle={`для: ${shortList(g.clients)}`}
                open={isOpen}
                onToggle={() => toggle(g.key)}
                stats={
                  <>
                    <span>
                      нужно <b>{formatNumber(g.needed)}</b>
                    </span>
                    <span>
                      на складе <b>{formatNumber(g.onStock, 0)}</b>
                    </span>
                    {g.short > 0 ? (
                      <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[12px] font-semibold text-danger">
                        докупить {formatNumber(g.short)}
                      </span>
                    ) : (
                      <span className="rounded-full bg-success-bg px-2 py-0.5 text-[12px] font-semibold text-success">хватает</span>
                    )}
                  </>
                }
              />

              {isOpen && (
                <div className="flex flex-col border-t border-border px-2 pb-2 pt-1">
                  {g.blocks.map((b) => (
                    <BobbinBlockView key={b.bobbin.bobbin_id} block={b} onJump={onJump} />
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

/** Одна бабина: сколько нужно на очередь и сколько на складе, ниже — кому сколько. */
function BobbinBlockView({ block: { bobbin: b, rows }, onJump }: { block: BobbinBlock; onJump: (taskId: string) => void }) {
  const firstShort = rows.findIndex((r) => r.short > 0);
  return (
    <div className="rounded-lg px-2 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13.5px] text-text">
        <span className="w-full break-words font-semibold leading-snug sm:w-auto">{b.name}</span>
        <span>
          <span className="hidden sm:inline">— </span>нужно <b>{pcs(b.needed)}</b>
        </span>
        <span className="text-muted">· на складе {formatNumber(b.on_stock, 0)}</span>
        <span className="text-[12px] text-muted">· {formatNumber(b.roll_norm)} простыней с бабины</span>
        {b.shortage > 0 && (
          <span className="rounded-full bg-danger-bg px-2 py-0.5 text-[12px] font-semibold text-danger">
            докупить {formatNumber(b.shortage)}
          </span>
        )}
      </div>
      <ul className="mt-1 flex flex-col border-l-2 border-border pl-2.5">
        {rows.map((r, n) => (
          <Fragment key={r.item_id}>
            {n === firstShort && n > 0 && (
              <li className="flex items-center gap-2 px-2 py-1 text-[11.5px] font-semibold text-danger">
                <span className="h-px flex-1 bg-danger/30" />
                склад закончился
                <span className="h-px flex-1 bg-danger/30" />
              </li>
            )}
            <UseLine row={r} onClick={() => onJump(r.task_id)} />
          </Fragment>
        ))}
      </ul>
    </div>
  );
}

/** Кому сколько: клиент, бабин, на какие простыни, номер в очереди и хватит ли склада. */
function UseLine({ row: r, onClick }: { row: UseRow; onClick: () => void }) {
  const full = r.short === 0;
  const none = r.from_stock === 0;
  const comment = clientComment(r.comment, r.client_name);
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        title="Показать задание в очереди"
        className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left text-[13px] hover:bg-primary-50 sm:flex-row sm:items-center sm:gap-4"
      >
        <span className="min-w-0 flex-1 break-words">
          <b className="text-text">{r.client_name || "Без клиента"}</b>
          {comment && <span className="font-semibold text-primary"> ({comment})</span>} — <b>{pcs(r.needed)}</b>
          <span className="text-muted">
            {" "}
            · на {pcs(r.sheets)} «{r.product_name}» · №{r.queue_no} в очереди
          </span>
          {r.leftover_sheets > 0 && (
            <span className="block text-[12px] text-muted">лишнее ≈ {pcs(r.leftover_sheets)} простыней останется на складе</span>
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
            <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">не хватает {pcs(r.short)}</span>
          )}
        </span>
      </button>
    </li>
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
