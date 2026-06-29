"use client";

import { clsx } from "clsx";
import {
  ArrowDownUp,
  ChevronRight,
  Clock,
  Layers,
  PackageCheck,
  Plus,
  TimerOff,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { KpiCard } from "@/components/ui/KpiCard";
import { Spinner } from "@/components/ui/Spinner";
import { CreateShiftReportModal } from "@/components/shiftReports/CreateShiftReportModal";
import { useAuthStore } from "@/lib/auth/store";
import { useShiftReportsList } from "@/lib/hooks/useShiftReports";
import { ShiftReportStatus, ShiftType, UserRole } from "@/lib/types/enums";
import type { ShiftReportListItem } from "@/lib/types/shiftReport";
import { formatDate, formatNumber } from "@/lib/utils/format";
import { SHIFT_SHORT_LABELS } from "@/lib/utils/shiftLabels";
import { shiftReportStatusStyles } from "@/lib/utils/statusStyles";
import { shiftMetrics } from "@/lib/utils/shiftMetrics";
import { CATEGORY_COLOR, CATEGORY_ORDER, CATEGORY_SHORT } from "@/lib/utils/shiftRawRules";

const PAGE_SIZE = 50;

const SHIFT_PILL: Record<ShiftType, { label: string; cls: string }> = {
  [ShiftType.SHIFT_1]: { label: SHIFT_SHORT_LABELS[ShiftType.SHIFT_1], cls: "bg-warning-bg text-warning" },
  [ShiftType.SHIFT_2]: { label: SHIFT_SHORT_LABELS[ShiftType.SHIFT_2], cls: "bg-indigo/15 text-indigo" },
};

const STATUS_OPTIONS: { value: ShiftReportStatus | ""; label: string }[] = [
  { value: "", label: "Все статусы" },
  ...Object.values(ShiftReportStatus).map((s) => ({ value: s, label: shiftReportStatusStyles[s].label })),
];

const CATEGORY_CHIPS = [
  { id: "all", label: "Все категории", color: "rgba(40,40,60,0.3)" },
  ...CATEGORY_ORDER.map((c) => ({ id: c, label: c, color: CATEGORY_COLOR[c] })),
];

// Палитра градиентов для аватара старшего смены — выбирается стабильно по id.
const AVATARS = [
  "linear-gradient(140deg,#f3a78b,#e87aa6)",
  "linear-gradient(140deg,#5b8def,#7aa6ff)",
  "linear-gradient(140deg,#8d6bff,#b08bff)",
  "linear-gradient(140deg,#3fc6c6,#5bd9c4)",
  "linear-gradient(140deg,#f0a23c,#f5c06b)",
  "linear-gradient(140deg,#5bc0eb,#7ad3f0)",
  "linear-gradient(140deg,#e87aa6,#f3a78b)",
  "linear-gradient(140deg,#6366f1,#8d6bff)",
];

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** Категории выпуска отчёта (из category товаров) в каноничном порядке. */
function reportCategories(r: ShiftReportListItem): string[] {
  const set = new Set<string>();
  for (const o of r.outputs) {
    const cat = CATEGORY_ORDER.find((c) => norm(c) === norm(o.product?.category));
    if (cat) set.add(cat);
  }
  return CATEGORY_ORDER.filter((c) => set.has(c));
}

function avatarOf(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length];
}

function initialsOf(name: string | undefined) {
  if (!name) return "—";
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function outputSummary(r: ShiftReportListItem): { name: string; sub: string } {
  const first = r.outputs[0];
  if (!first) return { name: "—", sub: "" };
  const firstName = first.product?.name ?? "Без названия";
  const name = r.outputs.length > 1 ? `${firstName} +${r.outputs.length - 1}` : firstName;
  const sub =
    r.outputs.length === 1
      ? `${formatNumber(first.quantity, 0)} ${first.product?.unit ?? ""}`.trim()
      : `${r.outputs.length} позиций`;
  return { name, sub };
}

function rawSummary(r: ShiftReportListItem): string {
  const first = r.materials[0];
  if (!first) return "—";
  if (r.materials.length === 1) {
    const unit = first.material?.unit ?? first.product?.unit ?? "";
    return `${formatNumber(first.quantity_used, 0)} ${unit}`.trim();
  }
  return `${r.materials.length} позиций`;
}

/** Пилюля простоя: 0 ч — спокойный зелёный, до 2 ч — жёлтый, больше — красный. */
function downtimePill(hours: number): { label: string; cls: string } {
  const label = hours <= 0 ? "—" : `${formatNumber(hours, Number.isInteger(hours) ? 0 : 1)} ч`;
  if (hours <= 0) return { label, cls: "bg-success-bg text-success" };
  if (hours <= 2) return { label, cls: "bg-warning-bg text-warning" };
  return { label, cls: "bg-danger-bg text-danger" };
}

// Сетка колонок таблицы — одна на шапку и строки, чтобы держать выравнивание.
const COLS =
  "grid grid-cols-[44px_96px_88px_138px_minmax(146px,1.2fr)_minmax(132px,1.1fr)_minmax(90px,0.9fr)_84px_132px_24px] items-center gap-3";

const headClass =
  "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";

export default function ShiftReportsPage() {
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const isMaster = role === UserRole.SHIFT_MASTER;
  // Создавать отчёты могут SA/B, мастер смены и зав. складом.
  const canCreate =
    role === UserRole.SUPER_ADMIN ||
    role === UserRole.BOSS ||
    role === UserRole.SHIFT_MASTER ||
    role === UserRole.WAREHOUSE_MANAGER;

  const [status, setStatus] = useState<ShiftReportStatus | "">("");
  const [shiftType, setShiftType] = useState<ShiftType | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading } = useShiftReportsList(
    {
      page,
      size: PAGE_SIZE,
      status: status || undefined,
      shift_type: shiftType || undefined,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    },
    isMaster
  );

  // Категория и направление сортировки применяются по загруженной странице
  // (на сменном отчёте нет колонки категории — она выводится из товаров).
  const displayed = useMemo(() => {
    const items = data?.items ?? [];
    const filtered = cat === "all" ? items : items.filter((r) => reportCategories(r).includes(cat));
    return [...filtered].sort((a, b) =>
      sortDir === "desc"
        ? b.shift_date.localeCompare(a.shift_date)
        : a.shift_date.localeCompare(b.shift_date)
    );
  }, [data?.items, cat, sortDir]);

  const total = data?.total ?? 0;
  const hasFilter = !!(dateFrom || dateTo || shiftType || status || cat !== "all");

  const kpis = useMemo(() => {
    let producedKg = 0;
    let rawKg = 0;
    for (const r of displayed) {
      const m = shiftMetrics(r);
      producedKg += m.producedKg;
      rawKg += m.rawKg;
    }
    const downtime = displayed.reduce((s, r) => s + (Number(r.downtime_hours) || 0), 0);
    const submitted = displayed.filter((r) => r.status === ShiftReportStatus.SUBMITTED).length;
    return { producedKg, rawKg, downtime, submitted };
  }, [displayed]);

  const downtimeLabel = `${formatNumber(kpis.downtime, Number.isInteger(kpis.downtime) ? 0 : 1)} ч`;

  function resetFilters() {
    setDateFrom("");
    setDateTo("");
    setShiftType("");
    setStatus("");
    setCat("all");
    setPage(1);
  }

  const inputCls =
    "rounded-xl border-[1.5px] border-border bg-white/70 px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-primary/50";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== FILTER BAR ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/55 px-3 py-1.5">
          <span className="text-[12px] text-muted">С</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="w-[120px] border-none bg-transparent text-[13px] text-text outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/60 bg-white/55 px-3 py-1.5">
          <span className="text-[12px] text-muted">По</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="w-[120px] border-none bg-transparent text-[13px] text-text outline-none"
          />
        </div>

        {/* Смена — сегментированный переключатель */}
        <div className="inline-flex rounded-xl border border-white/60 bg-white/55 p-1 text-[12.5px]">
          {[
            { v: "" as const, l: "Все" },
            { v: ShiftType.SHIFT_1, l: SHIFT_SHORT_LABELS[ShiftType.SHIFT_1] },
            { v: ShiftType.SHIFT_2, l: SHIFT_SHORT_LABELS[ShiftType.SHIFT_2] },
          ].map((opt) => (
            <button
              key={opt.v || "all"}
              onClick={() => {
                setShiftType(opt.v);
                setPage(1);
              }}
              className={clsx(
                "rounded-lg px-3 py-1 font-medium transition-colors",
                shiftType === opt.v
                  ? "bg-white text-text shadow-sm"
                  : "text-muted hover:text-text"
              )}
            >
              {opt.l}
            </button>
          ))}
        </div>

        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value as ShiftReportStatus | "");
            setPage(1);
          }}
          className={inputCls}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        {hasFilter && (
          <button
            onClick={resetFilters}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-bg"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2.2} />
            Сбросить
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="inline-flex items-center gap-2 rounded-xl border border-white/60 bg-white/55 px-3.5 py-2 text-[12.5px] font-semibold text-primary hover:bg-white/75"
        >
          <ArrowDownUp className="h-3.5 w-3.5" strokeWidth={2} />
          Дата · {sortDir === "desc" ? "сначала новые" : "сначала старые"}
        </button>
      </div>

      {/* ===== CATEGORY CHIPS ===== */}
      <div className="glass inline-flex flex-wrap items-center gap-1 self-start rounded-2xl p-1.5">
        {CATEGORY_CHIPS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCat(c.id)}
            className={clsx(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] transition-colors",
              cat === c.id
                ? "bg-white/90 font-semibold text-text shadow-sm"
                : "font-medium text-muted hover:text-text"
            )}
          >
            <span className="h-[9px] w-[9px] rounded-full" style={{ background: c.color }} />
            {c.label}
          </button>
        ))}
      </div>

      {/* ===== KPI STRIP ===== */}
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <KpiCard label="Сырьё ушло" value={`${formatNumber(kpis.rawKg, 0)} кг`} tone="primary" icon={Layers} />
        <KpiCard label="Выпуск" value={`${formatNumber(kpis.producedKg, 0)} кг`} tone="success" icon={PackageCheck} />
        <KpiCard label="Общий простой" value={downtimeLabel} tone="danger" icon={TimerOff} />
        <KpiCard label="На утверждении" value={formatNumber(kpis.submitted)} tone="warning" icon={Clock} />
      </div>

      {/* ===== REPORTS TABLE ===== */}
      <div className="glass flex flex-col rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-3 pb-4">
          <h3 className="text-[16px] font-bold tracking-tight text-text">Отчёты по сменам</h3>
          <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
            {displayed.length}
          </span>
          <div className="flex-1" />
          {canCreate && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" strokeWidth={2.4} />
              Новый отчёт
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[1040px]">
              {/* header */}
              <div className={clsx(COLS, "border-b border-black/[0.08] px-3 pb-2.5")}>
                <span className={headClass}>№</span>
                <span className={headClass}>Дата</span>
                <span className={headClass}>Смена</span>
                <span className={headClass}>Категория</span>
                <span className={headClass}>Старший за смену</span>
                <span className={headClass}>Произведено</span>
                <span className={headClass}>Сырьё</span>
                <span className={headClass}>Простой</span>
                <span className={headClass}>Статус</span>
                <span />
              </div>

              {displayed.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">Сменные отчёты не найдены</p>
              ) : (
                displayed.map((r, i) => {
                  const cats = reportCategories(r);
                  const primary = cats[0];
                  const catColor = primary ? CATEGORY_COLOR[primary] ?? "#5b8def" : "";
                  const out = outputSummary(r);
                  const shift = SHIFT_PILL[r.shift_type];
                  const dt = downtimePill(Number(r.downtime_hours) || 0);
                  return (
                    <Link
                      key={r.id}
                      href={`/shift-reports/${r.id}`}
                      className={clsx(COLS, "rounded-2xl px-3 py-3 transition-colors hover:bg-white/50")}
                    >
                      <span className="text-[13px] font-semibold text-primary">
                        {(page - 1) * PAGE_SIZE + i + 1}
                      </span>
                      <span className="text-[13px] text-text/70">{formatDate(r.shift_date)}</span>
                      <span>
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                            shift.cls
                          )}
                        >
                          {shift.label}
                        </span>
                      </span>
                      <span className="min-w-0">
                        {!primary ? (
                          <span className="text-[12.5px] text-muted">—</span>
                        ) : (
                          <span
                            className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                            style={{
                              color: catColor,
                              background: rgba(catColor, 0.13),
                              borderColor: rgba(catColor, 0.26),
                            }}
                          >
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ background: catColor }}
                            />
                            <span className="truncate">{CATEGORY_SHORT[primary] ?? primary}</span>
                            {cats.length > 1 && <span className="opacity-70">+{cats.length - 1}</span>}
                          </span>
                        )}
                      </span>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[11.5px] font-semibold text-white shadow-sm"
                          style={{ background: avatarOf(r.master_id) }}
                        >
                          {initialsOf(r.master?.full_name)}
                        </span>
                        <span className="flex min-w-0 flex-col leading-tight">
                          <span className="truncate text-[12.5px] font-semibold text-text">
                            {r.master?.full_name ?? "—"}
                          </span>
                          <span className="text-[11px] text-muted">Старший смены</span>
                        </span>
                      </span>
                      <span className="flex min-w-0 flex-col leading-tight">
                        <span className="truncate text-[12.5px] text-text/85">{out.name}</span>
                        {out.sub && <span className="text-[11.5px] font-semibold text-success">{out.sub}</span>}
                      </span>
                      <span className="text-[13px] font-semibold text-info">{rawSummary(r)}</span>
                      <span>
                        <span
                          className={clsx(
                            "inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold",
                            dt.cls
                          )}
                        >
                          {dt.label}
                        </span>
                      </span>
                      <span>
                        <Badge {...shiftReportStatusStyles[r.status]} />
                      </span>
                      <ChevronRight className="h-4 w-4 text-muted" strokeWidth={2} />
                    </Link>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* pagination */}
        {total > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between border-t border-black/[0.06] pt-3 text-[13px] text-muted">
            <span>Всего {total}</span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Назад
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={page * PAGE_SIZE >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд ›
              </Button>
            </div>
          </div>
        )}
      </div>

      <CreateShiftReportModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(reportId) => {
          setCreateOpen(false);
          router.push(`/shift-reports/${reportId}`);
        }}
      />
    </div>
  );
}
