"use client";

import { clsx } from "clsx";
import {
  Banknote,
  CalendarDays,
  CreditCard,
  Receipt,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import {
  useDashboard,
  useExpensesByCategory,
  useRevenueExpenseTrend,
} from "@/lib/hooks/useDashboard";
import { RevenueMode, UserRole } from "@/lib/types/enums";
import { apiErrorMessage } from "@/lib/api/http";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { roleHomeRoute } from "@/lib/utils/roleHomeRoute";

const DONUT_COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#94a3b8", "#7c3aed", "#dc2626"];

export default function DashboardPage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [revenueMode, setRevenueMode] = useState<RevenueMode>(RevenueMode.SHIPMENTS);

  // Дашборд доступен только SA/B (см. backend/app/api/routes/reports.py) — остальные роли уводим на их раздел.
  useEffect(() => {
    if (user && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.BOSS) {
      router.replace(roleHomeRoute(user.role));
    }
  }, [user, router]);

  const filters = {
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    revenue_mode: revenueMode,
  };

  const dashboard = useDashboard(filters);
  const trend = useRevenueExpenseTrend(filters);
  const expensesByCategory = useExpensesByCategory(filters);

  if (user && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.BOSS) {
    return null;
  }

  // Decimal-поля приходят с backend как строки ("44514.00") — Pie считает углы через
  // сумму значений по dataKey, и без явного приведения к числу `+` даёт конкатенацию строк.
  const expenseChartData = (expensesByCategory.data ?? []).map((row) => ({
    ...row,
    total_amount_num: Number(row.total_amount),
  }));
  const totalExpenses = expenseChartData.reduce((sum, row) => sum + row.total_amount_num, 0);

  const netProfit = dashboard.data ? Number(dashboard.data.net_profit) : 0;
  const ProfitIcon = netProfit >= 0 ? TrendingUp : TrendingDown;
  const profitTone = netProfit >= 0 ? "success" : "danger";

  return (
    <div className="flex flex-col gap-5">
      <div className="glass flex flex-wrap items-end justify-between gap-4 rounded-3xl p-4 shadow-xl shadow-black/5">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">С даты</label>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                strokeWidth={1.75}
              />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded-xl border border-white/40 bg-white/50 py-1.5 pl-9 pr-3 text-[13px] text-text outline-none focus:border-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-muted">По дату</label>
            <div className="relative">
              <CalendarDays
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                strokeWidth={1.75}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded-xl border border-white/40 bg-white/50 py-1.5 pl-9 pr-3 text-[13px] text-text outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
        <div className="inline-flex rounded-full border border-white/40 bg-white/30 p-1 text-[12.5px]">
          <button
            onClick={() => setRevenueMode(RevenueMode.SHIPMENTS)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 font-semibold transition-colors",
              revenueMode === RevenueMode.SHIPMENTS
                ? "bg-primary text-white shadow-sm shadow-primary/30"
                : "text-muted hover:text-text"
            )}
          >
            По отгрузкам
          </button>
          <button
            onClick={() => setRevenueMode(RevenueMode.PAYMENTS)}
            className={clsx(
              "rounded-full px-3.5 py-1.5 font-semibold transition-colors",
              revenueMode === RevenueMode.PAYMENTS
                ? "bg-primary text-white shadow-sm shadow-primary/30"
                : "text-muted hover:text-text"
            )}
          >
            По оплатам
          </button>
        </div>
      </div>

      {dashboard.isError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {apiErrorMessage(dashboard.error, "Не удалось загрузить дашборд")}
        </p>
      )}

      {dashboard.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : dashboard.data ? (
        <>
          <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
            <KpiCard
              label="Выручка"
              value={formatCurrency(dashboard.data.revenue)}
              tone="primary"
              icon={Wallet}
            />
            <KpiCard
              label="Расходы"
              value={formatCurrency(dashboard.data.total_expenses)}
              tone="warning"
              icon={Receipt}
            />
            <KpiCard
              label="Чистая прибыль"
              value={formatCurrency(dashboard.data.net_profit)}
              tone={profitTone}
              icon={ProfitIcon}
            />
            <KpiCard
              label="Дебиторка"
              value={formatCurrency(dashboard.data.accounts_receivable)}
              tone="danger"
              icon={CreditCard}
            />
            <KpiCard
              label="Заказов за период"
              value={formatNumber(dashboard.data.orders_count)}
              tone="neutral"
              icon={ShoppingCart}
            />
            <KpiCard
              label="Отгрузок подтверждено"
              value={formatNumber(dashboard.data.shipments_count)}
              tone="neutral"
              icon={Truck}
            />
            <KpiCard
              label="Оплат получено"
              value={formatNumber(dashboard.data.payments_count)}
              tone="success"
              icon={Banknote}
            />
          </div>

          <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Выручка и расходы по месяцам">
              {trend.isLoading ? (
                <div className="flex h-[260px] items-center justify-center">
                  <Spinner />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={trend.data ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#64748b" }} />
                    <YAxis tick={{ fontSize: 12, fill: "#64748b" }} width={70} />
                    <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    <Legend
                      formatter={(value) => (value === "revenue" ? "Выручка" : "Расходы")}
                    />
                    <Bar dataKey="revenue" name="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expenses" name="expenses" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card title="Расходы по категориям">
              {expensesByCategory.isLoading ? (
                <div className="flex h-[200px] items-center justify-center">
                  <Spinner />
                </div>
              ) : expenseChartData.length > 0 ? (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={expenseChartData}
                        dataKey="total_amount_num"
                        nameKey="category_name"
                        innerRadius={42}
                        outerRadius={64}
                        paddingAngle={1}
                      >
                        {expenseChartData.map((row, idx) => (
                          <Cell key={row.category_id} fill={DONUT_COLORS[idx % DONUT_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2.5 text-[12.5px]">
                    {expenseChartData.map((row, idx) => (
                      <div
                        key={row.category_id}
                        className="flex items-center justify-between border-t border-white/40 py-1.5 first:border-t-0"
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-sm"
                            style={{ backgroundColor: DONUT_COLORS[idx % DONUT_COLORS.length] }}
                          />
                          {row.category_name}
                        </span>
                        <b>
                          {totalExpenses > 0
                            ? `${Math.round((Number(row.total_amount) / totalExpenses) * 100)}%`
                            : "0%"}
                        </b>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="py-8 text-center text-sm text-muted">Нет расходов за период</p>
              )}
            </Card>
          </div>
        </>
      ) : null}
    </div>
  );
}
