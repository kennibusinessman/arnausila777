"use client";

import { clsx } from "clsx";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  ChevronDown,
  Droplets,
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
import { QuantityModal, type QtyAction, unitLabel } from "@/components/productionPlan/QuantityModal";
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
  useReorderSpunbond,
  useSpunbondPlan,
  useUpdateSpunbondSettings,
  useUpdateTask,
} from "@/lib/hooks/useProductionPlan";
import { Permission } from "@/lib/types/enums";
import {
  ProductionTaskStatus,
  type ColorEntry,
  type ColorPlan,
  type ItemRow,
  type Offer,
  type RawStatus,
  type SpunbondSettings,
  type TaskRow,
} from "@/lib/types/productionPlan";
import { formatDayMonth, formatNumber } from "@/lib/utils/format";

/**
 * План производства спанбонда — своя очередь заданий линии спанбонда.
 *
 * Весь расчёт делает бэкенд (services/spunbond_plan_service.py): сколько кг
 * полипропилена уйдёт на каждую позицию (1 кг сырья = 1 кг продукции), хватит ли
 * его на складе с учётом позиций выше по очереди, когда позиция будет готова при
 * выработке линии в кг за смену, и общий план по цветам — вместе с бабинами,
 * которых не хватает плану простыней.
 */

const kg = (n: number | string) => `${formatNumber(n, Number(n) % 1 ? 1 : 0)} кг`;
const qty = (n: number | string, unit: string) => `${formatNumber(n)} ${unitLabel(unit)}`;

const RAW_CHIP: Record<RawStatus, { label: string; className: string }> = {
  ok: { label: "Сырья хватает", className: "bg-success-bg text-success" },
  partial: { label: "Сырья частично", className: "bg-warning-bg text-warning" },
  none: { label: "Сырья нет", className: "bg-danger-bg text-danger" },
  no_weight: { label: "Нет веса", className: "bg-slate-200 text-slate-700" },
  done: { label: "Всё готово", className: "bg-success-bg text-success" },
};

const RAW_RANK: Record<RawStatus, number> = { none: 4, partial: 3, no_weight: 2, ok: 1, done: 0 };

const STATUS_LABEL: Record<ProductionTaskStatus, string> = {
  QUEUED: "В очереди",
  IN_PROGRESS: "В работе",
  DONE: "Отгружено",
  CANCELLED: "Отменено",
};

/** Плашка цвета рядом с названием. Неизвестный цвет — штриховка. */
const SWATCH: Record<string, string> = {
  Голубой: "#7cc4f0",
  Бирюзовый: "#2ec4b6",
  Синий: "#2f5fd0",
  Белый: "#ffffff",
  Зелёный: "#3aa15a",
  Салатовый: "#a6dc5a",
  Розовый: "#f39ac0",
  Красный: "#e03e3e",
  Бордовый: "#7d1f35",
  Жёлтый: "#f5d33f",
  Оранжевый: "#f39234",
  Фиолетовый: "#7d4bc7",
  Сиреневый: "#c3a2e6",
  Серый: "#9aa0a8",
  Чёрный: "#222222",
  Бежевый: "#e8d6b5",
  Коричневый: "#8a5a35",
};

function Swatch({ color }: { color: string | null | undefined }) {
  const fill = color ? SWATCH[color] : undefined;
  return (
    <span
      aria-hidden
      className="inline-block h-4 w-4 shrink-0 rounded-full border border-black/15"
      style={
        fill
          ? { background: fill }
          : { background: "repeating-linear-gradient(45deg,#d7dbe2 0 3px,#f4f5f7 3px 6px)" }
      }
    />
  );
}

const DISMISSED_KEY = "production-plan:spunbond:dismissed-offers";
const offerKey = (o: Offer) => `${o.item_id}:${o.free}`;

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

/** Худшее по сырью среди позиций задания и сколько кг не хватает. */
function taskRaw(t: TaskRow): { worst: RawStatus | null; short: number; kgNeeded: number } {
  let worst: RawStatus | null = null;
  let short = 0;
  let kgNeeded = 0;
  for (const i of t.items) {
    const s = i.raw_status ?? null;
    if (s && (worst === null || RAW_RANK[s] > RAW_RANK[worst])) worst = s;
    short += Number(i.raw_short_kg ?? 0);
    kgNeeded += Number(i.kg_needed ?? 0);
  }
  return { worst, short, kgNeeded };
}

/** «500 кг» или «10 шт + 200 кг» — позиции могут быть в разных единицах. */
function sumByUnit(items: ItemRow[], pick: (i: ItemRow) => number): string {
  const by = new Map<string, number>();
  for (const i of items) {
    const u = unitLabel(i.unit);
    by.set(u, (by.get(u) ?? 0) + pick(i));
  }
  return [...by.entries()].map(([u, n]) => `${formatNumber(n)} ${u}`).join(" + ");
}

export function SpunbondPlan() {
  const canManage = useCan(Permission.PRODUCTION_PLAN_MANAGE);
  const plan = useSpunbondPlan(canManage);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const reorder = useReorderSpunbond();
  const markReady = useMarkReady();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskRow | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [qtyAction, setQtyAction] = useState<QtyAction | null>(null);
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
        {apiErrorMessage(plan.error, "Не удалось загрузить план спанбонда")}
      </p>
    );
  }

  const offers = data.offers.filter((o) => !dismissed.includes(offerKey(o)));
  const lateCount = active.filter((t) => t.late).length;
  const rawShort = Number(data.raw_short);
  const needKg = Number(data.queue_kg) + Number(data.sheets_kg);
  const onError = (err: unknown) => setActionError(apiErrorMessage(err, "Не удалось выполнить действие"));
  const busy = reorder.isPending || updateTask.isPending || deleteTask.isPending;
  const allOpen = active.length > 0 && active.every((t) => expanded.has(t.id));

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
    if (!window.confirm(`Удалить задание ${what}?`)) return;
    setActionError(null);
    deleteTask.mutate(task.id, { onError });
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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
          Выработка: <b className="text-text">{kg(data.settings.kg_per_shift)}</b> за смену ·{" "}
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
            Есть свободного <b>{formatNumber(o.free)}</b> «{o.product_name}».{" "}
            {o.client_name ? (
              <>
                Передать клиенту <b>«{o.client_name}»</b> — {formatNumber(o.quantity)}?
              </>
            ) : (
              <>Закрепить {formatNumber(o.quantity)} за заданием без клиента?</>
            )}
          </p>
          <div className="flex gap-2">
            <Button
              variant="success"
              size="sm"
              disabled={markReady.isPending}
              onClick={() => {
                setActionError(null);
                markReady.mutate({ taskId: o.task_id, itemId: o.item_id, quantity: o.quantity }, { onError });
              }}
            >
              <Check className="h-4 w-4" /> Да
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                const next = [...dismissed, offerKey(o)];
                setDismissed(next);
                saveDismissed(next);
              }}
            >
              Нет
            </Button>
          </div>
        </div>
      ))}

      {actionError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">{actionError}</p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          label="Осталось сделать"
          value={kg(data.queue_kg)}
          icon={Layers}
          hint={<span className="text-muted">по очереди спанбонда</span>}
        />
        <KpiCard
          label="Смен работы"
          value={formatNumber(data.total_shifts, 1)}
          icon={Timer}
          tone="neutral"
          hint={<span className="text-muted">по {kg(data.settings.kg_per_shift)} за смену</span>}
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
          label="Полипропилен на складе"
          value={kg(data.raw_on_stock)}
          icon={Droplets}
          tone={rawShort ? "danger" : "success"}
          hint={
            rawShort ? (
              <span className="text-danger">
                нужно {kg(needKg)} · докупить {kg(rawShort)}
              </span>
            ) : (
              <span className="text-muted">нужно {kg(needKg)} — хватает</span>
            )
          }
        />
      </div>

      {data.raw.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          В справочнике сырья нет «Полипропилена» — остаток сырья не посчитать.
        </p>
      )}
      {data.no_weight > 0 && (
        <p className="flex items-center gap-2 rounded-xl bg-warning-bg px-3.5 py-2.5 text-[13px] text-warning">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          У {data.no_weight} поз. товар в штуках без веса — их сырьё и сроки не посчитаны. Укажите вес на странице
          «Товары».
        </p>
      )}

      {data.colors.length > 0 && <ColorsCard colors={data.colors} onJump={jumpTo} />}

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
            <ul className="flex flex-col gap-1.5">
              {closed.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border bg-white/40 px-3 py-2 text-[13px]"
                >
                  <span className="min-w-0 flex-1">
                    <b className="text-text">{t.client_name || "Без клиента"}</b>
                    {t.comment && <span className="font-semibold text-primary"> — {t.comment}</span>}
                    <span className="text-muted"> · {t.items.map((i) => i.product_name).join(", ")}</span>
                  </span>
                  <span className="tabular-nums text-muted">{sumByUnit(t.items, (i) => i.quantity)}</span>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                    {STATUS_LABEL[t.status]}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setStatus(t, ProductionTaskStatus.QUEUED)} disabled={busy}>
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
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <TaskFormModal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        task={editing}
        kind="SPUNBOND"
        perShift={data.settings.kg_per_shift}
      />
      <QuantityModal action={qtyAction} onClose={() => setQtyAction(null)} />
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} settings={data.settings} />
    </div>
  );
}

type ColorView = "all" | "queue";

/**
 * План по цветам. «Общий» — очередь спанбонда плюс бабины, которых не хватает
 * плану простыней (с клиентом, для кого они); «Только очередь» — без бабин.
 */
function ColorsCard({ colors, onJump }: { colors: ColorPlan[]; onJump: (taskId: string) => void }) {
  const [view, setView] = useState<ColorView>("all");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const hasSheets = colors.some((c) => Number(c.sheets_kg) > 0 || c.entries.some((e) => e.source === "sheets"));

  const shown = useMemo(
    () =>
      colors
        .map((c) => ({
          ...c,
          entries: view === "all" ? c.entries : c.entries.filter((e) => e.source === "queue"),
        }))
        .filter((c) => c.entries.length > 0),
    [colors, view]
  );
  const keyOf = (c: ColorPlan) => c.color ?? "—";
  const allOpen = shown.length > 0 && shown.every((c) => open.has(keyOf(c)));

  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Card
      title="План по цветам"
      action={
        <Button variant="ghost" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(shown.map(keyOf)))}>
          {allOpen ? "Свернуть все" : "Развернуть все"}
        </Button>
      }
    >
      <div className="mb-3 inline-flex flex-wrap gap-1 rounded-xl bg-white/60 p-1" role="tablist" aria-label="Что показывать">
        {(
          [
            { key: "all", label: "Общий — с бабинами для простыней" },
            { key: "queue", label: "Только очередь спанбонда" },
          ] as const
        ).map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => setView(v.key)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors",
              view === v.key ? "bg-primary text-white shadow-sm" : "text-muted hover:bg-white hover:text-text"
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
      {view === "all" && !hasSheets && (
        <p className="mb-2 text-[12.5px] text-muted">Плану простыней бабин хватает — докручивать их не нужно.</p>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((c) => {
          const key = keyOf(c);
          const isOpen = open.has(key);
          const totalKg = view === "all" ? Number(c.kg) : Number(c.queue_kg);
          const clients = [...new Set(c.entries.map((e) => e.client_name || "без клиента"))];
          return (
            <div key={key} className="rounded-xl border border-border bg-white/50">
              <button
                type="button"
                onClick={() => toggle(key)}
                aria-expanded={isOpen}
                className="flex w-full flex-wrap items-center gap-x-4 gap-y-1 px-3.5 py-2.5 text-left text-[13px]"
              >
                <span className="flex min-w-0 flex-1 basis-48 items-center gap-2.5">
                  <Swatch color={c.color} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-text">{c.color ?? "Без цвета"}</span>
                    <span className="block truncate text-[12px] text-muted">для: {clients.join(", ")}</span>
                  </span>
                </span>
                <span className="tabular-nums">
                  всего <b>{kg(totalKg)}</b>
                </span>
                {view === "all" && Number(c.sheets_kg) > 0 && (
                  <span className="rounded-full bg-indigo/10 px-2 py-0.5 text-[12px] font-semibold text-indigo">
                    бабины для простыней {kg(c.sheets_kg)}
                  </span>
                )}
                {c.no_weight > 0 && (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[12px] font-semibold text-slate-700">
                    без веса: {c.no_weight}
                  </span>
                )}
                <ChevronDown className={clsx("h-4 w-4 text-muted transition-transform", isOpen && "rotate-180")} />
              </button>

              {isOpen && (
                <div className="flex flex-col border-t border-border px-2 pb-2 pt-1">
                  {groupByProduct(c.entries).map((g) => (
                    <ProductGroup key={g.key} group={g} onJump={onJump} />
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

function plural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

interface ProductGroupData {
  key: string;
  productName: string;
  unit: string;
  quantity: number;
  /** null — у части строк нет веса, сумму кг не показать. */
  kg: number | null;
  entries: ColorEntry[];
}

/** Одно наименование у разных клиентов — одна строка: общее количество, ниже — кому сколько. */
function groupByProduct(entries: ColorEntry[]): ProductGroupData[] {
  const groups = new Map<string, ProductGroupData>();
  for (const e of entries) {
    const key = `${e.product_name}|${unitLabel(e.unit)}`;
    const g = groups.get(key) ?? { key, productName: e.product_name, unit: e.unit, quantity: 0, kg: 0, entries: [] };
    g.quantity += e.quantity;
    g.kg = g.kg === null || e.kg === null ? null : g.kg + Number(e.kg);
    g.entries.push(e);
    groups.set(key, g);
  }
  return [...groups.values()];
}

function ProductGroup({ group: g, onJump }: { group: ProductGroupData; onJump: (taskId: string) => void }) {
  const clients = new Set(g.entries.map((e) => `${e.client_name ?? ""}|${e.comment ?? ""}`)).size;
  return (
    <div className="rounded-lg px-2 py-2">
      <div className="flex flex-wrap items-baseline gap-x-2 text-[13.5px] text-text">
        <span className="font-semibold">{g.productName}</span>
        <span>
          — всего <b>{qty(g.quantity, g.unit)}</b>
        </span>
        {g.kg !== null && unitLabel(g.unit) !== "кг" && <span className="text-muted">({kg(g.kg)})</span>}
        {clients > 1 && (
          <span className="text-[12px] text-muted">
            · {clients} {plural(clients, "клиент", "клиента", "клиентов")}
          </span>
        )}
      </div>
      <ul className="mt-1 flex flex-col border-l-2 border-border pl-2.5">
        {g.entries.map((e) => (
          <ClientLine key={`${e.source}:${e.item_id}`} entry={e} onJump={onJump} />
        ))}
      </ul>
    </div>
  );
}

/** Кому сколько: клиент, количество, откуда строка и срок. */
function ClientLine({ entry: e, onJump }: { entry: ColorEntry; onJump: (taskId: string) => void }) {
  const body = (
    <>
      <span className="min-w-0 flex-1">
        <b className="text-text">{e.client_name || "Без клиента"}</b>
        {e.comment && <span className="font-semibold text-primary"> ({e.comment})</span>} — {qty(e.quantity, e.unit)}
        {e.kg !== null && unitLabel(e.unit) !== "кг" && <span className="text-muted"> ({kg(e.kg)})</span>}
        <span className="text-muted">
          {" "}
          · {e.source === "queue" ? `№${e.queue_no} в очереди` : `№${e.queue_no} в плане простыней`}
          {e.for_product && <> · на простыни «{e.for_product}»</>}
        </span>
      </span>
      <span className="flex shrink-0 flex-wrap items-center gap-1.5 text-[12px] tabular-nums">
        {e.source === "sheets" ? (
          <span className="rounded-full bg-indigo/10 px-2 py-0.5 font-semibold text-indigo">для простыней · не в очереди</span>
        ) : (
          <>
            {e.kg === null && (
              <span className="rounded-full bg-slate-200 px-2 py-0.5 font-semibold text-slate-700">нет веса</span>
            )}
            {e.eta && (
              <span className={clsx(e.late ? "font-semibold text-danger" : "text-muted")}>
                готово ≈ {formatDayMonth(e.eta)}
                {e.deadline && ` · срок ${formatDayMonth(e.deadline)}`}
              </span>
            )}
          </>
        )}
      </span>
    </>
  );
  const cls = "flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left text-[13px] sm:flex-row sm:items-center sm:gap-4";
  // Строки очереди ведут к заданию ниже; бабины для простыней — задание в другом плане.
  return (
    <li>
      {e.source === "queue" ? (
        <button type="button" onClick={() => onJump(e.task_id)} title="Показать задание в очереди" className={clsx(cls, "hover:bg-primary-50")}>
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
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
  const { worst, short, kgNeeded } = taskRaw(t);
  const chip = worst ? RAW_CHIP[worst] : null;
  const colors = [...new Set(t.items.map((i) => i.color ?? null))];

  return (
    <li
      id={`task-${t.id}`}
      className={clsx(
        "scroll-mt-24 rounded-2xl border bg-white/55",
        worst === "none" ? "border-danger/30" : worst === "partial" ? "border-warning/40" : "border-border"
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-3 py-2.5 text-left hover:bg-white/60"
      >
        <span className="flex min-w-0 flex-1 basis-48 items-center gap-2">
          <span className="w-6 shrink-0 text-[13px] font-bold tabular-nums text-muted">{index + 1}</span>
          <span className="flex shrink-0 -space-x-1">
            {colors.map((c) => (
              <Swatch key={c ?? "-"} color={c} />
            ))}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-bold text-text" title={t.comment ?? undefined}>
              {t.client_name || "Без клиента"}
              {t.comment && <span className="font-semibold text-primary"> — {t.comment}</span>}
            </span>
            <span className="block truncate text-[12px] text-muted">{t.items.map((i) => i.product_name).join(", ")}</span>
          </span>
        </span>
        <span className="shrink-0 text-right text-[13px] tabular-nums">
          <b className="text-text">{sumByUnit(t.items, (i) => i.remaining)}</b>
          {kgNeeded > 0 && t.items.some((i) => unitLabel(i.unit) !== "кг") && (
            <span className="text-muted"> · {kg(kgNeeded)}</span>
          )}
        </span>
        {chip && (
          <span className={clsx("shrink-0 rounded-full px-2 py-0.5 text-[12px] font-semibold", chip.className)}>
            {short > 0 ? `не хватает сырья: ${kg(short)}` : chip.label}
          </span>
        )}
        <span className={clsx("shrink-0 text-[12.5px] tabular-nums", t.late ? "font-semibold text-danger" : "text-muted")}>
          {t.eta ? `≈ ${formatDayMonth(t.eta)}` : ""}
          {t.deadline && ` · срок ${formatDayMonth(t.deadline)}`}
        </span>
        <ChevronDown className={clsx("h-4 w-4 shrink-0 text-muted transition-transform", expanded && "rotate-180")} />
      </button>

      {expanded && (
        <div className="border-t border-border px-3.5 pb-3 pt-2.5">
          <div className="flex flex-col gap-2">
            {t.items.map((i) => (
              <ItemLine key={i.id} item={i} onReady={() => onReady(i)} onShip={() => onShip(i)} />
            ))}
          </div>
          <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1.5">
            <span className="mr-auto flex items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => onMove(index, -1)} disabled={busy || index === 0}>
                <ArrowUp className="h-3.5 w-3.5" /> Выше
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onMove(index, 1)} disabled={busy || isLast}>
                <ArrowDown className="h-3.5 w-3.5" /> Ниже
              </Button>
            </span>
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
  const chip = i.raw_status ? RAW_CHIP[i.raw_status] : null;
  const shippedPct = Math.min(i.shipped / i.quantity, 1) * 100;
  const waitingPct = Math.min(i.awaiting_shipment / i.quantity, 1) * 100;
  const fromOrders = i.orders.reduce((s, o) => s + o.quantity, 0);
  const q = (n: number) => qty(n, i.unit);

  return (
    <div className="rounded-xl border border-border bg-white/60 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Swatch color={i.color} />
          <span className="min-w-0">
            <span className="block truncate text-[13.5px] font-semibold text-text">{i.product_name}</span>
            <span className="block text-[12.5px] tabular-nums text-muted">
              {i.remaining > 0 ? (
                <>
                  осталось <b className="text-text">{q(i.remaining)}</b> из {q(i.quantity)}
                </>
              ) : (
                <>всё сделано · {q(i.quantity)}</>
              )}
            </span>
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
              готово <b className="text-text">{q(i.ready)}</b>
            </span>
            <span>
              отгружено <b className="text-text">{q(i.shipped)}</b>
            </span>
            {i.awaiting_shipment > 0 && <span className="text-success">ждёт отгрузки {q(i.awaiting_shipment)}</span>}
          </div>
          <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-border">
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
              {o.order_number} — {q(o.quantity)}
            </Link>
          ))}
          {i.shipped > fromOrders && <span>вручную — {q(i.shipped - fromOrders)}</span>}
        </div>
      )}

      {i.remaining > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
          {chip && <span className={clsx("rounded-full px-2 py-0.5 font-semibold", chip.className)}>{chip.label}</span>}
          {i.kg_needed && (
            <span className="tabular-nums">
              полипропилена <b>{kg(i.kg_needed)}</b>
              {i.raw_short_kg ? <span className="text-danger"> · не хватает {kg(i.raw_short_kg)}</span> : null}
            </span>
          )}
          {i.raw_status === "no_weight" && (
            <span className="text-muted">у товара не указан вес — сырьё не посчитать</span>
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

function SettingsModal({
  open,
  onClose,
  settings,
}: {
  open: boolean;
  onClose: () => void;
  settings: SpunbondSettings;
}) {
  const save = useUpdateSpunbondSettings();
  const [perShift, setPerShift] = useState("");
  const [perDay, setPerDay] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setPerShift(String(settings.kg_per_shift));
    setPerDay(String(settings.shifts_per_day));
    setError(null);
  }, [open, settings]);

  function submit() {
    const a = Number(perShift);
    const b = Number(perDay);
    if (!Number.isInteger(a) || a <= 0 || !Number.isInteger(b) || b <= 0 || b > 3) {
      return setError("Целые числа: кг за смену больше нуля, смен в сутки от 1 до 3");
    }
    save.mutate(
      { kg_per_shift: a, shifts_per_day: b },
      { onSuccess: onClose, onError: (err) => setError(apiErrorMessage(err, "Не удалось сохранить")) }
    );
  }

  const input =
    "w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50";

  return (
    <Modal open={open} onClose={onClose} title="Выработка линии спанбонда" size="md">
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Кг продукции за 12-ч смену</label>
            <input type="number" min="1" value={perShift} onChange={(e) => setPerShift(e.target.value)} className={input} />
          </div>
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">Смен в сутки</label>
            <input type="number" min="1" max="3" value={perDay} onChange={(e) => setPerDay(e.target.value)} className={input} />
          </div>
        </div>
        <p className="text-[12.5px] text-muted">
          По ним считаются даты готовности. Сырьё: 1 кг полипропилена = 1 кг продукции.
        </p>
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
