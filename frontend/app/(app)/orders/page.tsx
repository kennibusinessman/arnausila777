"use client";

import {
  ArrowUpDown,
  CalendarDays,
  ChevronRight,
  Search,
  ShoppingCart,
  TrendingUp,
  Wallet,
  Weight,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { KpiCard } from "@/components/ui/KpiCard";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { CreateOrderModal } from "@/components/orders/CreateOrderModal";
import { useOrdersList, useOrdersSummary } from "@/lib/hooks/useOrders";
import type { OrderListItem } from "@/lib/types/order";
import { apiErrorMessage } from "@/lib/api/http";
import { formatCurrency, formatDate, formatNumber, formatWeight } from "@/lib/utils/format";

const AVATAR_GRADIENTS = [
  "linear-gradient(140deg,#f3a78b,#e87aa6)",
  "linear-gradient(140deg,#5b8def,#7aa6ff)",
  "linear-gradient(140deg,#8d6bff,#b08bff)",
  "linear-gradient(140deg,#3fc6c6,#5bd9c4)",
  "linear-gradient(140deg,#f0a23c,#f5c06b)",
  "linear-gradient(140deg,#5bc0eb,#7ad3f0)",
];

function avatarGradient(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function initialsOf(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

const PAGE_SIZE = 20;

/** Краткое перечисление наименований позиций: «А, Б +3». */
function itemsLabel(order: OrderListItem) {
  const names = order.items.map((i) => i.product?.name ?? "—");
  if (names.length <= 2) return names.join(", ") || "—";
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

/** Карточка заказа для мобильной раскладки (вместо строки таблицы). Тап — открывает поп-ап. */
function OrderCard({ order, onOpen }: { order: OrderListItem; onOpen: () => void }) {
  const name = order.client?.name ?? "—";
  return (
    <button
      type="button"
      onClick={onOpen}
      className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
    >
      <span
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white shadow-sm shadow-black/10"
        style={{ background: avatarGradient(order.client_id) }}
      >
        {initialsOf(name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-semibold text-primary">{order.order_number}</span>
          <span className="truncate text-[13.5px] font-medium text-text">{name}</span>
        </div>
        <span className="truncate text-xs text-muted">{itemsLabel(order)}</span>
        <span className="text-xs text-muted">
          {formatDate(order.created_at)} · {formatWeight(order.total_weight)} · {order.items.length} поз.
        </span>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-bold tabular-nums text-text">{formatCurrency(order.total_amount)}</span>
        <ChevronRight className="h-4 w-4 text-muted" strokeWidth={2} />
      </div>
    </button>
  );
}

/** Поле «лейбл + значение» в сетке деталей поп-апа. */
function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/60 bg-white/40 px-3 py-2.5">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-medium text-text">{value}</div>
    </div>
  );
}

/** Поп-ап с полной информацией по заказу. Данные берём прямо из строки списка (там уже всё есть). */
function OrderDetailModal({ order, onClose }: { order: OrderListItem | null; onClose: () => void }) {
  if (!order) return null;
  const name = order.client?.name ?? "—";
  return (
    <Modal open title={`Заказ ${order.order_number}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-[15px] font-semibold text-white shadow-sm shadow-black/10"
            style={{ background: avatarGradient(order.client_id) }}
          >
            {initialsOf(name)}
          </span>
          <div className="min-w-0">
            <div className="truncate text-[15px] font-semibold text-text">{name}</div>
            {order.client?.company_name && (
              <div className="truncate text-[12.5px] text-muted">{order.client.company_name}</div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <Field label="Дата" value={formatDate(order.created_at)} />
          <Field label="Срок" value={order.deadline ? formatDate(order.deadline) : "—"} />
          <Field label="Менеджер" value={order.manager?.full_name ?? "—"} />
          <Field label="Общий вес" value={formatWeight(order.total_weight)} />
        </div>

        <div>
          <div className="mb-2 px-1 text-[12.5px] font-semibold text-muted">
            Позиции · {order.items.length}
          </div>
          <div className="flex flex-col gap-2">
            {order.items.length === 0 ? (
              <p className="px-1 text-[13px] text-muted">Нет позиций</p>
            ) : (
              order.items.map((it) => (
                <div key={it.id} className="rounded-2xl border border-white/60 bg-white/50 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="font-medium text-text">{it.product?.name ?? "—"}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-text">
                      {formatCurrency(it.total_price)}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {formatNumber(Number(it.quantity), 0)} {it.product?.unit ?? ""} ×{" "}
                    {formatCurrency(it.unit_price)}
                  </div>
                  {it.comment && <div className="mt-1 text-xs text-muted">{it.comment}</div>}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="flex items-center justify-between rounded-2xl bg-primary-50 px-4 py-3">
          <span className="text-[13px] font-semibold text-muted">Итого</span>
          <span className="text-[19px] font-bold tabular-nums text-text">
            {formatCurrency(order.total_amount)}
          </span>
        </div>

        <Link
          href={`/orders/${order.id}`}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-primary to-indigo px-4 py-2.5 text-[14px] font-medium text-white shadow-[0_8px_20px_rgba(110,110,240,0.34)] transition-opacity hover:opacity-95"
        >
          Открыть полностью
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      </div>
    </Modal>
  );
}

export default function OrdersPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<OrderListItem | null>(null);

  const filters = {
    search: search || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading, isError, error } = useOrdersList({
    page,
    size: PAGE_SIZE,
    sort: sortDir,
    ...filters,
  });
  const summary = useOrdersSummary(filters);

  function resetPage() {
    setPage(1);
  }

  const avgOrderValue =
    summary.data && summary.data.count > 0
      ? Number(summary.data.total_amount) / summary.data.count
      : 0;

  const columns: DataTableColumn<OrderListItem>[] = [
    {
      header: "№",
      cell: (row) => (
        <Link href={`/orders/${row.id}`} className="font-semibold text-primary hover:underline">
          {row.order_number}
        </Link>
      ),
    },
    {
      header: "Клиент",
      cell: (row) => {
        const name = row.client?.name ?? "—";
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12.5px] font-semibold text-white shadow-sm shadow-black/10"
              style={{ background: avatarGradient(row.client_id) }}
            >
              {initialsOf(name)}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium text-text">{name}</span>
              {row.client?.company_name && (
                <span className="truncate text-xs text-muted">{row.client.company_name}</span>
              )}
            </div>
          </div>
        );
      },
    },
    {
      header: "Дата",
      cell: (row) => (
        <div className="flex flex-col">
          <span>{formatDate(row.created_at)}</span>
          {row.deadline && (
            <span className="text-xs text-muted">срок до {formatDate(row.deadline)}</span>
          )}
        </div>
      ),
    },
    {
      header: "Наименования",
      cell: (row) => {
        const names = row.items.map((item) => item.product?.name ?? "—");
        const label =
          names.length <= 2
            ? names.join(", ") || "—"
            : `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
        return (
          <div className="flex flex-col">
            <span className="truncate">{label}</span>
            {row.items.length > 0 && (
              <span className="text-xs text-muted">{row.items.length} поз.</span>
            )}
          </div>
        );
      },
    },
    { header: "Вес", cell: (row) => formatWeight(row.total_weight) },
    { header: "Сумма", align: "right", cell: (row) => formatCurrency(row.total_amount) },
    {
      header: "",
      align: "right",
      cell: (row) => (
        <Link
          href={`/orders/${row.id}`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-black/[0.04] hover:text-text"
        >
          <ChevronRight className="h-4 w-4" strokeWidth={2} />
        </Link>
      ),
    },
  ];

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasNext = to < total;
  const hasDateFilter = !!(dateFrom || dateTo);
  const rows = data?.items ?? [];

  // Пагинация — общая для таблицы (десктоп) и карточек (мобильный).
  const paginationControls = (
    <>
      <span>{total === 0 ? "Нет заказов" : `Показано ${from}–${to} из ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Назад
        </Button>
        <Button variant="secondary" size="sm" disabled={!hasNext} onClick={() => setPage((p) => p + 1)}>
          Вперёд ›
        </Button>
      </div>
    </>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-center gap-3 rounded-3xl p-3.5 shadow-xl shadow-black/5">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            strokeWidth={1.9}
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Поиск по имени клиента…"
            className="w-[220px] rounded-xl border border-white/40 bg-white/50 py-1.5 pl-9 pr-3 text-[13px] text-text outline-none focus:border-primary"
          />
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-1.5">
          <CalendarDays className="h-4 w-4 text-muted" strokeWidth={1.9} />
          <span className="text-xs text-muted">С</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              resetPage();
            }}
            className="bg-transparent text-[13px] text-text outline-none"
          />
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-1.5">
          <span className="text-xs text-muted">По</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              resetPage();
            }}
            className="bg-transparent text-[13px] text-text outline-none"
          />
        </div>

        {hasDateFilter && (
          <button
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              resetPage();
            }}
            className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[12.5px] font-medium text-danger hover:bg-danger-bg"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
            Сбросить
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
          className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-white/70"
        >
          <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2} />
          Дата · {sortDir === "desc" ? "сначала новые" : "сначала старые"}
        </button>
      </div>

      {(isError || summary.isError) && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {apiErrorMessage(error ?? summary.error, "Не удалось загрузить заказы")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fill,minmax(200px,1fr))]">
        <KpiCard
          label="Заказов за период"
          value={summary.data ? formatNumber(summary.data.count) : "—"}
          tone="neutral"
          icon={ShoppingCart}
        />
        <KpiCard
          label="Общий вес заказов"
          value={summary.data ? formatWeight(summary.data.total_weight) : "—"}
          tone="warning"
          icon={Weight}
        />
        <KpiCard
          label="Средний чек"
          value={summary.data ? formatCurrency(avgOrderValue) : "—"}
          tone="success"
          icon={TrendingUp}
        />
        <KpiCard
          label="Сумма за период"
          value={summary.data ? formatCurrency(summary.data.total_amount) : "—"}
          tone="primary"
          icon={Wallet}
        />
      </div>

      <div className="glass rounded-3xl p-5 shadow-xl shadow-black/5">
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-text">Заказы</h3>
          <span className="rounded-full border border-white/40 bg-white/40 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            {total} заказ{total === 1 ? "" : "ов"}
          </span>
          <div className="flex-1" />
          <Button onClick={() => setShowCreate(true)}>Новый заказ</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Десктоп (lg+) — привычная таблица */}
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={rows}
                keyField={(row) => row.id}
                emptyMessage="Заказы не найдены"
                footer={paginationControls}
              />
            </div>

            {/* Телефон/планшет (< lg) — карточки, тап открывает поп-ап с деталями */}
            <div className="lg:hidden">
              {rows.length === 0 ? (
                <p className="py-10 text-center text-muted">Заказы не найдены</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {rows.map((row) => (
                    <OrderCard key={row.id} order={row} onOpen={() => setSelected(row)} />
                  ))}
                </div>
              )}
              <div className="mt-3 flex items-center justify-between px-1 text-[12.5px] text-muted">
                {paginationControls}
              </div>
            </div>
          </>
        )}
      </div>

      <CreateOrderModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(orderId) => router.push(`/orders/${orderId}`)}
      />

      <OrderDetailModal order={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
