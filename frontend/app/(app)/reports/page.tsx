"use client";

import { clsx } from "clsx";
import type { LucideIcon } from "lucide-react";
import {
  AlertCircle,
  AlertTriangle,
  Banknote,
  Boxes,
  Coins,
  Download,
  Layers,
  LayoutGrid,
  Package,
  Receipt,
  TrendingUp,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import { useDashboard, useRevenueExpenseTrend } from "@/lib/hooks/useDashboard";
import { usePaymentsList, usePaymentsSummary } from "@/lib/hooks/usePayments";
import {
  useDebts,
  usePnLReport,
  useProductionReport,
  useSalesByProduct,
  useStockMovement,
  useStockReport,
} from "@/lib/hooks/useReports";
import { useShiftReportsList } from "@/lib/hooks/useShiftReports";
import { ItemType, PaymentMethod, RevenueMode, ShiftReportStatus, ShiftType, UserRole } from "@/lib/types/enums";
import {
  formatCompactCurrency,
  formatCurrency,
  formatDate,
  formatDayMonth,
  formatNumber,
} from "@/lib/utils/format";
import { shiftMetrics } from "@/lib/utils/shiftMetrics";

const PALETTE = ["#5b8def", "#8d6bff", "#3fc6c6", "#f0a23c", "#e87aa6", "#94a3b8"];
const col = (i: number) => PALETTE[i % PALETTE.length] ?? PALETTE[0]!;

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const fmtNum = (n: number) => Math.round(n).toLocaleString("ru-RU");
const monthLabel = (period: string) => {
  const [, m] = period.split("-");
  const idx = Number(m) - 1;
  return MONTHS_SHORT[idx] ?? period;
};

type ReportId =
  | "sales"
  | "topProducts"
  | "receivables"
  | "clients"
  | "movement"
  | "payments"
  | "shifts"
  | "production"
  | "stock";
const REPORT_LABEL: Record<ReportId, string> = {
  sales: "Продажи",
  topProducts: "Топ товаров",
  receivables: "Дебиторка",
  clients: "Топ клиентов",
  movement: "Движение",
  payments: "Платежи",
  shifts: "Смены",
  production: "Производство",
  stock: "Остатки",
};

const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Наличные",
  [PaymentMethod.BANK_TRANSFER]: "Перевод",
  [PaymentMethod.CARD]: "Карта",
  [PaymentMethod.OTHER]: "Другое",
};

const SHIFT_TYPE_LABEL: Record<ShiftType, string> = {
  [ShiftType.SHIFT_1]: "Смена 1",
  [ShiftType.SHIFT_2]: "Смена 2",
};

type Period = "" | "week" | "month" | "quarter" | "year";
const PERIOD_LABEL: Record<Period, string> = {
  "": "Всё время",
  week: "Неделя",
  month: "Месяц",
  quarter: "Квартал",
  year: "Год",
};

function periodRange(p: Period): { from: string; to: string } {
  if (!p) return { from: "", to: "" };
  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const d = new Date(today);
  if (p === "week") d.setDate(d.getDate() - 7);
  else if (p === "month") d.setMonth(d.getMonth() - 1);
  else if (p === "quarter") d.setMonth(d.getMonth() - 3);
  else d.setFullYear(d.getFullYear() - 1);
  return { from: d.toISOString().slice(0, 10), to };
}

interface FilterState {
  from: string;
  to: string;
  revenueMode: RevenueMode;
}

export default function ReportsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;

  const reports = useMemo<ReportId[]>(() => {
    if (isAdmin)
      return [
        "sales",
        "topProducts",
        "clients",
        "receivables",
        "movement",
        "payments",
        "shifts",
        "production",
        "stock",
      ];
    if (role === UserRole.SALES_MANAGER) return ["receivables", "clients", "payments"];
    if (role === UserRole.WAREHOUSE_MANAGER) return ["production", "stock", "movement"];
    return [];
  }, [isAdmin, role]);

  const [report, setReport] = useState<ReportId>(reports[0] ?? "receivables");
  const [period, setPeriod] = useState<Period>("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [revenueMode, setRevenueMode] = useState<RevenueMode>(RevenueMode.SHIPMENTS);

  function applyPeriod(p: Period) {
    setPeriod(p);
    const r = periodRange(p);
    setFrom(r.from);
    setTo(r.to);
  }

  const filters: FilterState = { from, to, revenueMode };
  const periodLabel = period ? PERIOD_LABEL[period] : "Всё время";

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ===== CONTROLS BAR ===== */}
      <div className="glass flex flex-wrap items-center gap-2.5 rounded-2xl p-3">
        <div className="flex flex-wrap gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          {reports.map((r) => (
            <button
              key={r}
              onClick={() => setReport(r)}
              className={clsx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                report === r
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {REPORT_LABEL[r]}
            </button>
          ))}
        </div>

        <div className="flex-1" />

        {report === "sales" && (
          <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
            {[
              [RevenueMode.SHIPMENTS, "По отгрузкам"],
              [RevenueMode.PAYMENTS, "По оплатам"],
            ].map(([m, label]) => (
              <button
                key={m}
                onClick={() => setRevenueMode(m as RevenueMode)}
                className={clsx(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] transition-colors",
                  revenueMode === m
                    ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                    : "font-medium text-muted hover:text-text"
                )}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          {(["week", "month", "quarter", "year"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => applyPeriod(p)}
              className={clsx(
                "whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12px] transition-colors",
                period === p
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {PERIOD_LABEL[p]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5">
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPeriod("");
            }}
            className="w-[112px] border-none bg-transparent text-[12.5px] text-text outline-none"
          />
          <span className="text-muted">—</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPeriod("");
            }}
            className="w-[112px] border-none bg-transparent text-[12.5px] text-text outline-none"
          />
        </div>

        <button
          disabled
          title="Скоро"
          className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-primary to-indigo px-4 py-2 text-[12.5px] font-semibold text-white opacity-60 shadow-[0_8px_18px_rgba(110,110,240,0.3)]"
        >
          <Download className="h-[15px] w-[15px]" strokeWidth={2.1} /> Экспорт
        </button>
      </div>

      {/* ===== REPORT BODY ===== */}
      {report === "sales" && <SalesReport filters={filters} periodLabel={periodLabel} />}
      {report === "topProducts" && <TopProductsReport filters={filters} periodLabel={periodLabel} />}
      {report === "receivables" && <ReceivablesReport periodLabel={periodLabel} />}
      {report === "clients" && <ClientsReport periodLabel={periodLabel} />}
      {report === "movement" && <MovementReport filters={filters} periodLabel={periodLabel} />}
      {report === "payments" && <PaymentsReport filters={filters} periodLabel={periodLabel} />}
      {report === "shifts" && <ShiftsReport filters={filters} periodLabel={periodLabel} />}
      {report === "production" && <ProductionReport filters={filters} periodLabel={periodLabel} />}
      {report === "stock" && <StockReport periodLabel={periodLabel} />}
    </div>
  );
}

/* ---------------- presentational pieces ---------------- */

interface Kpi {
  label: string;
  value: string;
  valueColor?: string;
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
}

function KpiStrip({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      {items.map((k) => (
        <div key={k.label} className="glass flex items-center justify-between gap-3 rounded-3xl p-4">
          <div className="min-w-0">
            <div className="whitespace-nowrap text-[12px] font-medium text-muted">{k.label}</div>
            <div
              className="mt-1.5 truncate text-[22px] font-bold tracking-tight tabular-nums"
              style={{ color: k.valueColor ?? "#1c1c22" }}
            >
              {k.value}
            </div>
          </div>
          <span
            className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px]"
            style={{ background: k.iconBg }}
          >
            <k.icon className="h-5 w-5" strokeWidth={2} style={{ color: k.iconColor }} />
          </span>
        </div>
      ))}
    </div>
  );
}

interface Bar {
  label: string;
  value: number;
  valueLabel: string;
}

function BarCard({ title, periodLabel, bars }: { title: string; periodLabel: string; bars: Bar[] }) {
  const max = Math.max(...bars.map((b) => b.value), 1);
  return (
    <div className="glass flex flex-col rounded-3xl p-5">
      <div className="mb-3 flex items-center gap-2">
        <h3 className="flex-1 text-[15px] font-bold tracking-tight text-text">{title}</h3>
        <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
          {periodLabel}
        </span>
      </div>
      {bars.length === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-muted">Нет данных</div>
      ) : (
        <div className="flex h-[190px] items-end gap-2 px-1">
          {bars.map((b, i) => (
            <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
              <span className="whitespace-nowrap text-[11px] font-semibold text-text">{b.valueLabel}</span>
              <div
                className="w-full rounded-t-lg"
                style={{
                  height: `${Math.max(4, (b.value / max) * 150)}px`,
                  background: `linear-gradient(180deg, ${col(i)}, ${col(i + 1)})`,
                }}
              />
              <span className="max-w-full truncate text-center text-[10.5px] text-muted">{b.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Segment {
  name: string;
  value: number;
}

function DonutCard({
  title,
  center,
  centerLabel,
  segments,
}: {
  title: string;
  center: string;
  centerLabel: string;
  segments: Segment[];
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let cum = 0;
  const stops = segments
    .map((s, i) => {
      const start = total > 0 ? (cum / total) * 100 : 0;
      cum += s.value;
      const end = total > 0 ? (cum / total) * 100 : 0;
      return `${col(i)} ${start}% ${end}%`;
    })
    .join(", ");
  return (
    <div className="glass flex flex-col rounded-3xl p-5">
      <h3 className="mb-3 text-[15px] font-bold tracking-tight text-text">{title}</h3>
      {segments.length === 0 || total === 0 ? (
        <div className="flex flex-1 items-center justify-center py-8 text-[13px] text-muted">Нет данных</div>
      ) : (
        <div className="flex flex-1 items-center gap-4">
          <div className="relative h-[118px] w-[118px] shrink-0">
            <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(from -90deg, ${stops})` }} />
            <div className="absolute inset-[26px] flex flex-col items-center justify-center rounded-full bg-[rgba(248,250,255,0.96)] text-center">
              <div className="text-[14px] font-bold leading-none tracking-tight text-text">{center}</div>
              <div className="mt-0.5 text-[9px] font-medium leading-tight text-muted">{centerLabel}</div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5 overflow-y-auto">
            {segments.map((s, i) => (
              <div key={i} className="flex min-w-0 items-center gap-2">
                <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: col(i) }} />
                <span className="min-w-0 flex-1 truncate text-[11.5px] text-text">{s.name}</span>
                <span className="shrink-0 text-[12px] font-bold text-text">
                  {total > 0 ? Math.round((s.value / total) * 100) : 0}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface Cell {
  node: ReactNode;
  align?: "right" | "center";
  className?: string;
  style?: React.CSSProperties;
}
interface TableHeader {
  text: string;
  align?: "right" | "center";
}

function TableCard({
  title,
  grid,
  headers,
  rows,
  empty,
}: {
  title: string;
  grid: string;
  headers: TableHeader[];
  rows: { key: string; cells: Cell[] }[];
  empty: string;
}) {
  return (
    <div className="glass flex min-h-0 flex-1 flex-col rounded-3xl p-5">
      <div className="flex items-center gap-3 pb-3">
        <h3 className="text-[15px] font-bold tracking-tight text-text">{title}</h3>
        <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
          {rows.length} строк
        </span>
      </div>
      {/* Десктоп (lg+) — таблица с горизонтальным скроллом */}
      <div className="hidden min-h-0 flex-1 overflow-x-auto lg:block">
        <div className="flex h-full min-w-[680px] flex-col lg:min-w-0">
      <div className="grid gap-3 border-b border-border px-2 pb-2.5" style={{ gridTemplateColumns: grid }}>
        {headers.map((h, i) => (
          <span
            key={i}
            className={clsx(
              "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted",
              h.align === "right" && "text-right",
              h.align === "center" && "text-center"
            )}
          >
            {h.text}
          </span>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted">{empty}</div>
        ) : (
          rows.map((r) => (
            <div
              key={r.key}
              className="grid items-center gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-white/50"
              style={{ gridTemplateColumns: grid }}
            >
              {r.cells.map((c, i) => (
                <span
                  key={i}
                  className={clsx(
                    "truncate text-[13px] text-text",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className
                  )}
                  style={c.style}
                >
                  {c.node}
                </span>
              ))}
            </div>
          ))
        )}
      </div>
        </div>
      </div>

      {/* Телефон/планшет (< lg) — карточки вместо таблицы (строка показывается целиком) */}
      <div className="flex flex-col gap-2.5 lg:hidden">
        {rows.length === 0 ? (
          <div className="py-10 text-center text-[13px] text-muted">{empty}</div>
        ) : (
          rows.map((r) => (
            <div key={r.key} className="rounded-2xl border border-white/60 bg-white/45 p-3.5">
              <div
                className={clsx("mb-2 truncate text-[14px] font-semibold text-text", r.cells[0]?.className)}
                style={r.cells[0]?.style}
              >
                {r.cells[0]?.node}
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                {r.cells.slice(1).map((c, i) => (
                  <div key={i} className="flex flex-col gap-0.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                      {headers[i + 1]?.text}
                    </span>
                    <span className={clsx("text-[13px] text-text", c.className)} style={c.style}>
                      {c.node}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function ChartsRow({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">{children}</div>;
}

function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center py-20">
      <Spinner />
    </div>
  );
}

/** Топ-N по значению + агрегат «Прочее» для остального (для пончика). */
function topWithRest(items: Segment[], n: number): Segment[] {
  if (items.length <= n) return items;
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((s, x) => s + x.value, 0);
  if (rest > 0) top.push({ name: "Прочее", value: rest });
  return top;
}

/* ---------------- reports ---------------- */

function SalesReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const params = {
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
    revenue_mode: filters.revenueMode,
  };
  const pnl = usePnLReport(params);
  const trend = useRevenueExpenseTrend(params);
  const dash = useDashboard(params);

  if (pnl.isLoading || trend.isLoading) return <Loading />;
  const p = pnl.data;
  const points = trend.data ?? [];

  const profit = Number(p?.net_profit ?? 0);
  const kpis: Kpi[] = [
    { label: "Выручка", value: formatCompactCurrency(p?.revenue ?? 0), icon: TrendingUp, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Расходы", value: formatCompactCurrency(p?.total_expenses ?? 0), icon: Receipt, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Прибыль", value: formatCompactCurrency(profit), valueColor: profit >= 0 ? "#178a55" : "#bd4836", icon: Banknote, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Отгрузок", value: String(dash.data?.shipments_count ?? 0), icon: Truck, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
  ];

  const bars: Bar[] = points.map((pt) => ({
    label: monthLabel(pt.period),
    value: Number(pt.revenue),
    valueLabel: formatCompactCurrency(pt.revenue),
  }));

  const cats = (p?.expenses_by_category ?? []).map((c) => ({ name: c.category_name, value: Number(c.total_amount) }));
  const segments = topWithRest(cats, 5);

  const grid = "minmax(0,1fr) 110px 130px 130px 130px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard
          title={filters.revenueMode === RevenueMode.PAYMENTS ? "Поступления по месяцам" : "Выручка по месяцам"}
          periodLabel={periodLabel}
          bars={bars}
        />
        <DonutCard
          title="Расходы по категориям"
          center={formatCompactCurrency(p?.total_expenses ?? 0)}
          centerLabel="расходы"
          segments={segments}
        />
      </ChartsRow>
      <TableCard
        title="Выручка и расходы по месяцам"
        grid={grid}
        headers={[{ text: "Месяц" }, { text: "Период", align: "center" }, { text: "Выручка", align: "right" }, { text: "Расходы", align: "right" }, { text: "Прибыль", align: "right" }]}
        empty="Нет данных за период"
        rows={points.map((pt) => {
          const rev = Number(pt.revenue);
          const exp = Number(pt.expenses);
          const pr = rev - exp;
          return {
            key: pt.period,
            cells: [
              { node: monthLabel(pt.period), className: "font-semibold" },
              { node: pt.period, align: "center", className: "text-muted" },
              { node: formatCurrency(pt.revenue), align: "right", className: "font-bold tabular-nums text-success" },
              { node: formatCurrency(pt.expenses), align: "right", className: "tabular-nums text-text/70" },
              { node: formatCurrency(pr), align: "right", className: "font-bold tabular-nums", style: { color: pr >= 0 ? "#178a55" : "#bd4836" } },
            ],
          };
        })}
      />
    </div>
  );
}

function ReceivablesReport({ periodLabel }: { periodLabel: string }) {
  const { data, isLoading } = useDebts(true);
  if (isLoading) return <Loading />;
  const rows = data?.rows ?? [];
  const totalDebt = Number(data?.total_debt ?? 0);
  const debts = rows.map((r) => Number(r.debt));
  const maxDebt = debts.length ? Math.max(...debts) : 0;
  const avgDebt = rows.length ? totalDebt / rows.length : 0;

  const kpis: Kpi[] = [
    { label: "Общий долг", value: formatCompactCurrency(totalDebt), valueColor: "#bd4836", icon: AlertCircle, iconColor: "#d6553f", iconBg: "rgba(214,85,63,0.14)" },
    { label: "Должников", value: String(rows.length), icon: Users, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Макс. долг", value: formatCompactCurrency(maxDebt), valueColor: "#c47d1f", icon: TrendingUp, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Средний долг", value: formatCompactCurrency(avgDebt), icon: Coins, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
  ];

  const byDebt = [...rows].sort((a, b) => Number(b.debt) - Number(a.debt));
  const bars: Bar[] = byDebt.slice(0, 6).map((r) => ({
    label: r.client_name.split(" ")[0] ?? r.client_name,
    value: Number(r.debt),
    valueLabel: formatCompactCurrency(r.debt),
  }));
  const segments = topWithRest(byDebt.map((r) => ({ name: r.client_name, value: Number(r.debt) })), 5);

  const grid = "minmax(0,1.3fr) minmax(0,1fr) 140px 140px 140px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Долги по клиентам" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Структура задолженности" center={formatCompactCurrency(totalDebt)} centerLabel="общий долг" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Дебиторская задолженность"
        grid={grid}
        headers={[{ text: "Клиент" }, { text: "Компания" }, { text: "Отгружено", align: "right" }, { text: "Оплачено", align: "right" }, { text: "Долг", align: "right" }]}
        empty="Должников не найдено"
        rows={byDebt.map((r) => ({
          key: r.client_id,
          cells: [
            { node: r.client_name, className: "font-semibold" },
            { node: r.company_name ?? "—", className: "text-muted" },
            { node: formatCurrency(r.total_shipped), align: "right", className: "tabular-nums text-text/70" },
            { node: formatCurrency(r.total_paid), align: "right", className: "tabular-nums text-success" },
            { node: formatCurrency(r.debt), align: "right", className: "font-bold tabular-nums text-danger" },
          ],
        }))}
      />
    </div>
  );
}

function ClientsReport({ periodLabel }: { periodLabel: string }) {
  const { data, isLoading } = useDebts(false);
  if (isLoading) return <Loading />;
  const rows = data?.rows ?? [];
  const shipped = rows.map((r) => Number(r.total_shipped));
  const totalShipped = shipped.reduce((s, x) => s + x, 0);
  const maxShipped = shipped.length ? Math.max(...shipped) : 0;
  const avgShipped = rows.length ? totalShipped / rows.length : 0;

  const kpis: Kpi[] = [
    { label: "Клиентов", value: String(rows.length), icon: Users, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Топ клиент", value: formatCompactCurrency(maxShipped), icon: TrendingUp, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Средний оборот", value: formatCompactCurrency(avgShipped), icon: Coins, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Итого отгружено", value: formatCompactCurrency(totalShipped), icon: Wallet, iconColor: "#0ea5b7", iconBg: "rgba(14,165,183,0.14)" },
  ];

  const byShipped = [...rows].sort((a, b) => Number(b.total_shipped) - Number(a.total_shipped));
  const bars: Bar[] = byShipped.slice(0, 6).map((r) => ({
    label: r.client_name.split(" ")[0] ?? r.client_name,
    value: Number(r.total_shipped),
    valueLabel: formatCompactCurrency(r.total_shipped),
  }));
  const segments = topWithRest(byShipped.map((r) => ({ name: r.client_name, value: Number(r.total_shipped) })), 5);

  const grid = "minmax(0,1.3fr) minmax(0,1fr) 140px 140px 130px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Топ клиентов по обороту" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Доли клиентов" center={formatCompactCurrency(totalShipped)} centerLabel="оборот" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Клиенты по обороту"
        grid={grid}
        headers={[{ text: "Клиент" }, { text: "Компания" }, { text: "Отгружено", align: "right" }, { text: "Оплачено", align: "right" }, { text: "Долг", align: "right" }]}
        empty="Нет данных"
        rows={byShipped.map((r) => {
          const debt = Number(r.debt);
          return {
            key: r.client_id,
            cells: [
              { node: r.client_name, className: "font-semibold" },
              { node: r.company_name ?? "—", className: "text-muted" },
              { node: formatCurrency(r.total_shipped), align: "right", className: "font-bold tabular-nums" },
              { node: formatCurrency(r.total_paid), align: "right", className: "tabular-nums text-success" },
              { node: debt > 0 ? formatCurrency(debt) : "—", align: "right", className: "tabular-nums", style: { color: debt > 0 ? "#bd4836" : "rgba(40,40,60,0.35)" } },
            ],
          };
        })}
      />
    </div>
  );
}

function ProductionReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const params = { date_from: filters.from || undefined, date_to: filters.to || undefined };
  const { data, isLoading } = useProductionReport(params);
  const shifts = useShiftReportsList({ ...params, size: 100 }, false);
  if (isLoading || shifts.isLoading) return <Loading />;
  const rows = data ?? [];
  const totalQty = rows.reduce((s, r) => s + Number(r.total_quantity), 0);

  // Вес выпуска/сырья за период — по утверждённым сменам (там есть base_weight и расход сырья).
  const agg = (shifts.data?.items ?? [])
    .filter((r) => r.status === ShiftReportStatus.APPROVED)
    .reduce(
      (a, r) => {
        const m = shiftMetrics(r);
        a.producedKg += m.producedKg;
        a.defectKg += m.defectKg;
        a.rawKg += m.rawKg;
        return a;
      },
      { producedKg: 0, defectKg: 0, rawKg: 0 }
    );
  const defectShare = agg.producedKg > 0 ? (agg.defectKg / agg.producedKg) * 100 : 0;

  const kpis: Kpi[] = [
    { label: "Сырьё ушло", value: `${fmtNum(agg.rawKg)} кг`, icon: Boxes, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Выпуск", value: `${fmtNum(agg.producedKg)} кг`, icon: Package, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Брак", value: `${fmtNum(agg.defectKg)} кг`, valueColor: agg.defectKg > 0 ? "#c47d1f" : "#1c1c22", icon: AlertTriangle, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Доля брака", value: `${defectShare.toFixed(1)}%`, icon: TrendingUp, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
  ];

  const byQty = [...rows].sort((a, b) => Number(b.total_quantity) - Number(a.total_quantity));
  const bars: Bar[] = byQty.slice(0, 6).map((r) => ({
    label: r.product_name.split(" ")[0] ?? r.product_name,
    value: Number(r.total_quantity),
    valueLabel: `${fmtNum(Number(r.total_quantity))} ${r.unit}`,
  }));
  const segments = topWithRest(byQty.map((r) => ({ name: r.product_name, value: Number(r.total_quantity) })), 5);

  const grid = "minmax(0,1.5fr) 150px 150px 130px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Выпуск по товарам" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Доли выпуска" center={fmtNum(totalQty)} centerLabel="выпущено" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Производство по товарам"
        grid={grid}
        headers={[{ text: "Товар" }, { text: "SKU" }, { text: "Выпущено", align: "right" }, { text: "Брак", align: "right" }]}
        empty="Нет данных за период"
        rows={byQty.map((r) => ({
          key: r.product_id,
          cells: [
            { node: r.product_name, className: "font-semibold" },
            { node: r.sku ?? "—", className: "text-muted" },
            { node: `${formatNumber(r.total_quantity, 3)} ${r.unit}`, align: "right", className: "font-bold tabular-nums" },
            { node: `${formatNumber(r.total_defect, 3)} ${r.unit}`, align: "right", className: "tabular-nums", style: { color: Number(r.total_defect) > 0 ? "#c47d1f" : "rgba(40,40,60,0.35)" } },
          ],
        }))}
      />
    </div>
  );
}

interface AggStock {
  item_id: string;
  item_type: ItemType;
  item_name: string;
  sku: string | null;
  unit: string;
  quantity: number;
}

function StockReport({ periodLabel }: { periodLabel: string }) {
  const { data, isLoading } = useStockReport({ include_zero: false });

  const aggregated = useMemo<AggStock[]>(() => {
    const map = new Map<string, AggStock>();
    for (const row of data ?? []) {
      const ex = map.get(row.item_id);
      if (ex) ex.quantity += Number(row.quantity);
      else
        map.set(row.item_id, {
          item_id: row.item_id,
          item_type: row.item_type,
          item_name: row.item_name,
          sku: row.sku,
          unit: row.unit,
          quantity: Number(row.quantity),
        });
    }
    return Array.from(map.values());
  }, [data]);

  if (isLoading) return <Loading />;

  const products = aggregated.filter((r) => r.item_type === ItemType.PRODUCT);
  const materials = aggregated.filter((r) => r.item_type === ItemType.MATERIAL);
  const totalUnits = aggregated.reduce((s, r) => s + r.quantity, 0);

  const kpis: Kpi[] = [
    { label: "Позиций", value: String(aggregated.length), icon: Boxes, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Всего единиц", value: fmtNum(totalUnits), icon: LayoutGrid, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Товаров", value: String(products.length), icon: Package, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Сырья", value: String(materials.length), icon: Layers, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
  ];

  const byQty = [...aggregated].sort((a, b) => b.quantity - a.quantity);
  const bars: Bar[] = byQty.slice(0, 6).map((r) => ({
    label: r.item_name.split(" ")[0] ?? r.item_name,
    value: r.quantity,
    valueLabel: `${fmtNum(r.quantity)} ${r.unit}`,
  }));
  const segments = topWithRest(byQty.map((r) => ({ name: r.item_name, value: r.quantity })), 5);

  const grid = "120px minmax(0,1.5fr) 140px 150px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Остатки по позициям" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Структура остатков" center={fmtNum(totalUnits)} centerLabel="единиц" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Остатки на складе"
        grid={grid}
        headers={[{ text: "Тип" }, { text: "Наименование" }, { text: "SKU" }, { text: "Остаток", align: "right" }]}
        empty="Нет остатков"
        rows={byQty.map((r) => ({
          key: r.item_id,
          cells: [
            {
              node: (
                <span
                  className="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                  style={
                    r.item_type === ItemType.MATERIAL
                      ? { background: "rgba(141,107,255,0.13)", color: "#6d52cc", borderColor: "rgba(141,107,255,0.26)" }
                      : { background: "rgba(91,141,239,0.13)", color: "#3f6fd6", borderColor: "rgba(91,141,239,0.26)" }
                  }
                >
                  {r.item_type === ItemType.MATERIAL ? "Сырьё" : "Товар"}
                </span>
              ),
            },
            { node: r.item_name, className: "font-semibold" },
            { node: r.sku ?? "—", className: "text-muted" },
            { node: `${formatNumber(r.quantity, 3)} ${r.unit}`, align: "right", className: "font-bold tabular-nums" },
          ],
        }))}
      />
    </div>
  );
}

function TopProductsReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const { data, isLoading } = useSalesByProduct({
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
  });
  if (isLoading) return <Loading />;
  const rows = data ?? []; // отсортированы по выручке (бэкенд)
  const totalRevenue = rows.reduce((s, r) => s + Number(r.total_revenue), 0);
  const leader = rows[0];
  const avgRevenue = rows.length ? totalRevenue / rows.length : 0;

  const kpis: Kpi[] = [
    { label: "Позиций", value: String(rows.length), icon: Boxes, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Лидер продаж", value: leader?.product_name ?? "—", icon: TrendingUp, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Общий оборот", value: formatCompactCurrency(totalRevenue), icon: Wallet, iconColor: "#0ea5b7", iconBg: "rgba(14,165,183,0.14)" },
    { label: "Средний оборот", value: formatCompactCurrency(avgRevenue), icon: Coins, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
  ];

  const bars: Bar[] = rows.slice(0, 6).map((r) => ({
    label: r.product_name.split(" ")[0] ?? r.product_name,
    value: Number(r.total_revenue),
    valueLabel: formatCompactCurrency(r.total_revenue),
  }));
  const segments = topWithRest(rows.map((r) => ({ name: r.product_name, value: Number(r.total_revenue) })), 5);

  const grid = "minmax(0,1.4fr) 130px 150px 90px 130px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Выручка по товарам" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Доли по выручке" center={formatCompactCurrency(totalRevenue)} centerLabel="оборот" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Детализация по товарам"
        grid={grid}
        headers={[{ text: "Товар" }, { text: "Объём", align: "right" }, { text: "Выручка", align: "right" }, { text: "Доля", align: "right" }, { text: "Ср. цена", align: "right" }]}
        empty="Нет продаж за период"
        rows={rows.map((r) => {
          const share = totalRevenue > 0 ? (Number(r.total_revenue) / totalRevenue) * 100 : 0;
          return {
            key: r.product_id,
            cells: [
              { node: r.product_name, className: "font-semibold" },
              { node: `${formatNumber(r.total_quantity, 3)} ${r.unit}`, align: "right", className: "tabular-nums text-text/70" },
              { node: formatCurrency(r.total_revenue), align: "right", className: "font-bold tabular-nums text-success" },
              { node: `${share.toFixed(1)}%`, align: "right", className: "tabular-nums text-muted" },
              { node: formatCurrency(r.avg_price), align: "right", className: "tabular-nums" },
            ],
          };
        })}
      />
    </div>
  );
}

function MovementReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const { data, isLoading } = useStockMovement({
    date_from: filters.from || undefined,
    date_to: filters.to || undefined,
  });
  if (isLoading) return <Loading />;
  const rows = data ?? []; // отсортированы по обороту (бэкенд)
  const totalIn = rows.reduce((s, r) => s + Number(r.total_in), 0);
  const totalOut = rows.reduce((s, r) => s + Number(r.total_out), 0);
  const balance = totalIn - totalOut;

  const kpis: Kpi[] = [
    { label: "Позиций", value: String(rows.length), icon: Boxes, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Поступило", value: fmtNum(totalIn), valueColor: "#178a55", icon: Package, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Расход", value: fmtNum(totalOut), valueColor: "#c47d1f", icon: Truck, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Баланс", value: fmtNum(balance), valueColor: balance >= 0 ? "#178a55" : "#bd4836", icon: TrendingUp, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
  ];

  const byIn = [...rows].sort((a, b) => Number(b.total_in) - Number(a.total_in));
  const bars: Bar[] = byIn.slice(0, 6).map((r) => ({
    label: r.item_name.split(" ")[0] ?? r.item_name,
    value: Number(r.total_in),
    valueLabel: `${fmtNum(Number(r.total_in))} ${r.unit}`,
  }));
  const segments = topWithRest(
    rows.filter((r) => Number(r.balance) > 0).map((r) => ({ name: r.item_name, value: Number(r.balance) })),
    5
  );

  const grid = "minmax(0,1.4fr) 120px 120px 120px 120px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Поступления по товарам" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Структура остатка" center={fmtNum(balance)} centerLabel="баланс" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Движение по товарам"
        grid={grid}
        headers={[{ text: "Товар" }, { text: "Поступило", align: "right" }, { text: "Расход", align: "right" }, { text: "Баланс", align: "right" }, { text: "Оборот", align: "right" }]}
        empty="Нет движений за период"
        rows={rows.map((r) => {
          const bal = Number(r.balance);
          const turnover = Number(r.total_in) + Number(r.total_out);
          return {
            key: r.item_id,
            cells: [
              { node: r.item_name, className: "font-semibold" },
              { node: `${formatNumber(r.total_in, 3)} ${r.unit}`, align: "right", className: "tabular-nums text-success" },
              { node: `${formatNumber(r.total_out, 3)} ${r.unit}`, align: "right", className: "tabular-nums", style: { color: "#c47d1f" } },
              { node: `${formatNumber(r.balance, 3)} ${r.unit}`, align: "right", className: "font-bold tabular-nums", style: { color: bal >= 0 ? "#178a55" : "#bd4836" } },
              { node: `${formatNumber(turnover, 3)} ${r.unit}`, align: "right", className: "tabular-nums text-muted" },
            ],
          };
        })}
      />
    </div>
  );
}

function PaymentsReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const periodParams = { date_from: filters.from || undefined, date_to: filters.to || undefined };
  const summary = usePaymentsSummary(periodParams);
  const list = usePaymentsList({ ...periodParams, size: 100, sort: "desc" });
  if (summary.isLoading || list.isLoading) return <Loading />;
  const s = summary.data;
  const payments = list.data?.items ?? [];
  const total = Number(s?.total_amount ?? 0);

  const kpis: Kpi[] = [
    { label: "Получено", value: formatCompactCurrency(total), valueColor: "#178a55", icon: Wallet, iconColor: "#0ea5b7", iconBg: "rgba(14,165,183,0.14)" },
    { label: "Платежей", value: String(s?.count ?? 0), icon: Receipt, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Клиентов", value: String(s?.client_count ?? 0), icon: Users, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Средний платёж", value: formatCompactCurrency(s?.average ?? 0), icon: Coins, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
  ];

  // Тренд и разбивка считаются по последним 100 платежам периода (страница списка).
  const byMonth = new Map<string, number>();
  for (const p of payments) byMonth.set(p.payment_date.slice(0, 7), (byMonth.get(p.payment_date.slice(0, 7)) ?? 0) + Number(p.amount));
  const bars: Bar[] = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([m, v]) => ({ label: monthLabel(m), value: v, valueLabel: formatCompactCurrency(v) }));

  const byMethod = new Map<PaymentMethod, number>();
  for (const p of payments) byMethod.set(p.payment_method, (byMethod.get(p.payment_method) ?? 0) + Number(p.amount));
  const segments: Segment[] = [...byMethod.entries()].map(([m, v]) => ({ name: PAYMENT_METHOD_LABEL[m], value: v }));
  const methodsTotal = segments.reduce((a, x) => a + x.value, 0);

  const grid = "minmax(0,1.3fr) 130px 150px 140px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Платежи по месяцам" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Способы оплаты" center={formatCompactCurrency(methodsTotal)} centerLabel="оплачено" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Последние платежи"
        grid={grid}
        headers={[{ text: "Клиент" }, { text: "Дата" }, { text: "Сумма", align: "right" }, { text: "Метод", align: "right" }]}
        empty="Нет платежей за период"
        rows={payments.map((p) => ({
          key: p.id,
          cells: [
            { node: p.client?.name ?? "—", className: "font-semibold" },
            { node: formatDayMonth(p.payment_date), className: "text-muted" },
            { node: formatCurrency(p.amount), align: "right", className: "font-bold tabular-nums text-success" },
            { node: PAYMENT_METHOD_LABEL[p.payment_method], align: "right", className: "text-muted" },
          ],
        }))}
      />
    </div>
  );
}

function ShiftsReport({ filters, periodLabel }: { filters: FilterState; periodLabel: string }) {
  const { data, isLoading } = useShiftReportsList(
    { date_from: filters.from || undefined, date_to: filters.to || undefined, size: 100 },
    false
  );
  if (isLoading) return <Loading />;
  const reports = data?.items ?? [];

  // Агрегат за период: выпуск/сырьё в кг и общий выход (% сырья → чистый продукт).
  const agg = reports.reduce(
    (a, r) => {
      const m = shiftMetrics(r);
      a.producedKg += m.producedKg;
      a.netKg += m.netKg;
      a.rawKg += m.rawKg;
      a.defectKg += m.defectKg;
      return a;
    },
    { producedKg: 0, netKg: 0, rawKg: 0, defectKg: 0 }
  );
  const yieldPct = agg.rawKg > 0 ? (agg.netKg / agg.rawKg) * 100 : null;

  const kpis: Kpi[] = [
    { label: "Сырьё ушло", value: `${fmtNum(agg.rawKg)} кг`, icon: Boxes, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Выпуск", value: `${fmtNum(agg.producedKg)} кг`, icon: Package, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Выход", value: yieldPct !== null ? `${yieldPct.toFixed(1)}%` : "—", valueColor: "#6d52cc", icon: TrendingUp, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Брак", value: `${fmtNum(agg.defectKg)} кг`, valueColor: agg.defectKg > 0 ? "#c47d1f" : "#1c1c22", icon: AlertTriangle, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
  ];

  const recent = [...reports].sort((a, b) => a.shift_date.localeCompare(b.shift_date)).slice(-6);
  const bars: Bar[] = recent.map((r) => {
    const kg = shiftMetrics(r).producedKg;
    return {
      label: formatDayMonth(r.shift_date).split(" ").slice(0, 2).join(" "),
      value: kg,
      valueLabel: `${fmtNum(kg)} кг`,
    };
  });

  const byMaster = new Map<string, number>();
  for (const r of reports) {
    const name = r.master?.full_name ?? "—";
    byMaster.set(name, (byMaster.get(name) ?? 0) + shiftMetrics(r).producedKg);
  }
  const segments = topWithRest([...byMaster.entries()].map(([name, value]) => ({ name, value })), 5);

  const grid = "104px minmax(0,1fr) 84px 116px 116px 84px";
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <KpiStrip items={kpis} />
      <ChartsRow>
        <BarCard title="Выпуск по сменам, кг" periodLabel={periodLabel} bars={bars} />
        <DonutCard title="Выпуск по мастерам" center={fmtNum(agg.producedKg)} centerLabel="кг выпуск" segments={segments} />
      </ChartsRow>
      <TableCard
        title="Сменные отчёты"
        grid={grid}
        headers={[
          { text: "Дата" },
          { text: "Мастер" },
          { text: "Смена", align: "center" },
          { text: "Выпуск", align: "right" },
          { text: "Сырьё", align: "right" },
          { text: "Выход", align: "right" },
        ]}
        empty="Нет смен за период"
        rows={[...reports]
          .sort((a, b) => b.shift_date.localeCompare(a.shift_date))
          .map((r) => {
            const m = shiftMetrics(r);
            return {
              key: r.id,
              cells: [
                { node: formatDate(r.shift_date), className: "font-semibold" },
                { node: r.master?.full_name ?? "—", className: "text-muted" },
                { node: SHIFT_TYPE_LABEL[r.shift_type], align: "center", className: "text-muted" },
                { node: `${formatNumber(m.producedKg, 1)} кг`, align: "right", className: "font-bold tabular-nums" },
                { node: `${formatNumber(m.rawKg, 1)} кг`, align: "right", className: "tabular-nums text-text/70" },
                {
                  node: m.yieldPct !== null ? `${m.yieldPct.toFixed(1)}%` : "—",
                  align: "right",
                  className: "font-bold tabular-nums",
                  style: { color: "#6d52cc" },
                },
              ],
            };
          })}
      />
    </div>
  );
}
