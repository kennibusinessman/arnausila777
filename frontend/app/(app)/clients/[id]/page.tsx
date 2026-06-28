"use client";

import {
  AlertCircle,
  ArrowLeft,
  Mail,
  MapPin,
  Package,
  Phone,
  Receipt,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { useClientStats } from "@/lib/hooks/useClients";
import { usePaymentsList } from "@/lib/hooks/usePayments";
import { useShipmentsList } from "@/lib/hooks/useShipments";
import type { PaymentRead } from "@/lib/types/payment";
import type { ShipmentListItem } from "@/lib/types/shipment";
import { formatCurrency, formatDayMonth } from "@/lib/utils/format";
import { avatarGradient, initialsOf, paymentMethodMeta } from "@/lib/utils/paymentMethodMeta";

const LIST_SIZE = 12;

function purposeOf(p: PaymentRead): string {
  if (p.order) return `Заказ ${p.order.order_number}`;
  return p.comment?.trim() || "Платёж";
}

export default function ClientStatsPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;

  const statsQuery = useClientStats(clientId);
  const stats = statsQuery.data;

  const [payPage, setPayPage] = useState(1);
  const [shipPage, setShipPage] = useState(1);

  const paymentsQuery = usePaymentsList({ client_id: clientId, size: LIST_SIZE, page: payPage, sort: "desc" });
  const shipmentsQuery = useShipmentsList({ client_id: clientId, size: LIST_SIZE, page: shipPage });

  if (statsQuery.isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner />
      </div>
    );
  }

  if (statsQuery.isError || !stats) {
    return (
      <div className="glass mx-auto mt-8 flex max-w-md flex-col items-center gap-3 rounded-3xl p-8 text-center">
        <AlertCircle className="h-8 w-8 text-danger" />
        <div className="text-[15px] font-semibold text-text">Клиент не найден</div>
        <div className="text-[13px] text-muted">
          Возможно, он удалён или у вас нет к нему доступа.
        </div>
        <Link href="/clients">
          <Button variant="secondary" size="sm">
            <ArrowLeft className="h-4 w-4" /> К списку клиентов
          </Button>
        </Link>
      </div>
    );
  }

  const c = stats.client;
  const debt = Number(stats.debt);
  const debtPositive = debt > 0.0001;

  const kpis = [
    {
      label: "Текущий долг",
      value: debtPositive ? formatCurrency(stats.debt) : "Нет долга",
      valueColor: debtPositive ? "#bd4836" : "#178a55",
      icon: Wallet,
      iconColor: debtPositive ? "#d6553f" : "#1f9d63",
      iconBg: debtPositive ? "rgba(214,85,63,0.14)" : "rgba(31,157,99,0.14)",
      hint: `Отгружено ${formatCurrency(stats.total_shipped)}`,
    },
    {
      label: "Всего оплачено",
      value: formatCurrency(stats.total_paid),
      valueColor: "#1c1c22",
      icon: Receipt,
      iconColor: "#3b82f6",
      iconBg: "rgba(59,130,246,0.14)",
      hint: `${stats.payment_count} ${stats.payment_count === 1 ? "платёж" : "платежей"}`,
    },
    {
      label: "Всего отгружено",
      value: formatCurrency(stats.total_shipped),
      valueColor: "#1c1c22",
      icon: Truck,
      iconColor: "#8b5cf6",
      iconBg: "rgba(139,92,246,0.14)",
      hint: `${stats.shipment_count} ${stats.shipment_count === 1 ? "отгрузка" : "отгрузок"}`,
    },
    {
      label: "Средний платёж",
      value: formatCurrency(stats.avg_payment),
      valueColor: "#1c1c22",
      icon: TrendingUp,
      iconColor: "#c47d1f",
      iconBg: "rgba(240,162,60,0.14)",
      hint: `${stats.order_count} ${stats.order_count === 1 ? "заказ" : "заказов"}`,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* breadcrumb / back */}
      <Link
        href="/clients"
        className="inline-flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="h-4 w-4" /> К списку клиентов
      </Link>

      {/* ===== CLIENT HEADER ===== */}
      <div className="glass flex flex-wrap items-center gap-4 rounded-3xl p-5">
        <div
          className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border-2 border-white/70 text-[22px] font-bold text-white shadow-[0_8px_18px_rgba(40,50,90,0.18)]"
          style={{ background: avatarGradient(c.name) }}
        >
          {initialsOf(c.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-bold tracking-tight text-text">{c.name}</h1>
          {c.company_name && <div className="text-[13.5px] text-muted">{c.company_name}</div>}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1.5 text-[12.5px] text-muted">
            {c.phone && (
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" /> {c.phone}
              </span>
            )}
            {c.email && (
              <span className="inline-flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {c.email}
              </span>
            )}
            {c.address && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" /> {c.address}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 text-right">
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
            {debtPositive ? "Долг" : "Статус"}
          </span>
          <span
            className="text-[20px] font-bold tracking-tight tabular-nums"
            style={{ color: debtPositive ? "#bd4836" : "#178a55" }}
          >
            {debtPositive ? formatCurrency(stats.debt) : "Оплачено"}
          </span>
        </div>
      </div>

      {/* ===== KPI STRIP ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="glass rounded-3xl p-4">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-muted">{k.label}</span>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ background: k.iconBg }}
              >
                <k.icon className="h-[18px] w-[18px]" strokeWidth={2} style={{ color: k.iconColor }} />
              </span>
            </div>
            <div
              className="mt-2 text-[22px] font-bold tracking-tight tabular-nums"
              style={{ color: k.valueColor }}
            >
              {k.value}
            </div>
            <div className="mt-1 text-[12px] font-medium text-muted">{k.hint}</div>
          </div>
        ))}
      </div>

      {/* ===== TIMELINES ===== */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* PAYMENTS */}
        <div className="glass flex flex-col rounded-3xl p-5">
          <div className="flex items-center gap-2.5 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(31,157,99,0.14)]">
              <Receipt className="h-[17px] w-[17px] text-success" strokeWidth={2} />
            </span>
            <h3 className="text-[15px] font-bold tracking-tight text-text">История оплат</h3>
            <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
              {stats.payment_count}
            </span>
          </div>

          <div className="min-h-[120px] flex-1">
            {paymentsQuery.isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : (paymentsQuery.data?.items.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-[13px] text-muted">Оплат пока нет</div>
            ) : (
              <div className="flex flex-col">
                {paymentsQuery.data!.items.map((p) => {
                  const meta = paymentMethodMeta[p.payment_method];
                  return (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/50"
                    >
                      <span
                        className="h-9 w-1 shrink-0 rounded-full"
                        style={{ background: meta.dot }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-semibold text-text">
                          {purposeOf(p)}
                        </div>
                        <div className="text-[11.5px] text-muted">{formatDayMonth(p.payment_date)}</div>
                      </div>
                      <span
                        className="inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold"
                        style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                      >
                        {meta.short}
                      </span>
                      <span className="shrink-0 text-right text-[13.5px] font-bold tabular-nums text-success">
                        +{formatCurrency(p.amount)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ListFooter
            page={payPage}
            size={LIST_SIZE}
            total={paymentsQuery.data?.total ?? 0}
            onPrev={() => setPayPage((p) => p - 1)}
            onNext={() => setPayPage((p) => p + 1)}
          />
        </div>

        {/* SHIPMENTS */}
        <div className="glass flex flex-col rounded-3xl p-5">
          <div className="flex items-center gap-2.5 pb-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[rgba(139,92,246,0.14)]">
              <Package className="h-[17px] w-[17px] text-indigo" strokeWidth={2} />
            </span>
            <h3 className="text-[15px] font-bold tracking-tight text-text">Отгрузки</h3>
            <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
              {stats.shipment_count}
            </span>
          </div>

          <div className="min-h-[120px] flex-1">
            {shipmentsQuery.isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner />
              </div>
            ) : (shipmentsQuery.data?.items.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-[13px] text-muted">Отгрузок пока нет</div>
            ) : (
              <div className="flex flex-col">
                {shipmentsQuery.data!.items.map((s: ShipmentListItem) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-3 rounded-2xl px-2.5 py-2.5 transition-colors hover:bg-white/50"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[rgba(141,107,255,0.12)]">
                      <Truck className="h-[16px] w-[16px] text-indigo" strokeWidth={1.9} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/orders/${s.order_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="truncate text-[13px] font-semibold text-text underline-offset-2 hover:text-primary hover:underline"
                      >
                        {s.order ? `Заказ ${s.order.order_number}` : s.shipment_number}
                      </Link>
                      <div className="text-[11.5px] text-muted">{formatDayMonth(s.shipment_date)}</div>
                    </div>
                    <span className="shrink-0 text-right text-[13.5px] font-bold tabular-nums text-text">
                      {formatCurrency(s.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <ListFooter
            page={shipPage}
            size={LIST_SIZE}
            total={shipmentsQuery.data?.total ?? 0}
            onPrev={() => setShipPage((p) => p - 1)}
            onNext={() => setShipPage((p) => p + 1)}
          />
        </div>
      </div>
    </div>
  );
}

function ListFooter({
  page,
  size,
  total,
  onPrev,
  onNext,
}: {
  page: number;
  size: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (total <= size) return null;
  const from = (page - 1) * size + 1;
  const to = Math.min(page * size, total);
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-border pt-3 text-[12px] text-muted">
      <span>
        {from}–{to} из {total}
      </span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={onPrev}>
          ‹
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={onNext}>
          ›
        </Button>
      </div>
    </div>
  );
}
