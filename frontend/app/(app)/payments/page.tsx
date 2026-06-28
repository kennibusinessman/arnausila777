"use client";

import { clsx } from "clsx";
import {
  ArrowUpDown,
  Download,
  Pencil,
  Plus,
  Receipt,
  TrendingUp,
  Trash2,
  Users,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { DetailModal } from "@/components/ui/DetailModal";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import { useClientOptions } from "@/lib/hooks/useClients";
import { useOrderOptionsByClient } from "@/lib/hooks/useOrders";
import {
  useCreatePayment,
  useDeletePayment,
  usePaymentsList,
  usePaymentsSummary,
  useUpdatePayment,
} from "@/lib/hooks/usePayments";
import { apiErrorMessage } from "@/lib/api/http";
import { PaymentMethod, UserRole } from "@/lib/types/enums";
import type { PaymentRead } from "@/lib/types/payment";
import { formatCurrency, formatDayMonth } from "@/lib/utils/format";
import { avatarGradient, initialsOf, paymentMethodMeta } from "@/lib/utils/paymentMethodMeta";

const PAGE_SIZE = 20;
const METHODS = Object.values(PaymentMethod);

function purposeOf(p: PaymentRead): string {
  if (p.order) return `Заказ ${p.order.order_number}`;
  return p.comment?.trim() || "—";
}

interface FormState {
  client_id: string;
  order_id: string | null;
  payment_date: string;
  amount: string;
  payment_method: PaymentMethod;
  comment: string;
}

function emptyForm(): FormState {
  return {
    client_id: "",
    order_id: null,
    payment_date: new Date().toISOString().slice(0, 10),
    amount: "",
    payment_method: PaymentMethod.CASH,
    comment: "",
  };
}

export default function PaymentsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<PaymentRead | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentRead | null>(null);

  const filters = {
    payment_method: paymentMethod || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  };

  const { data, isLoading } = usePaymentsList({ page, size: PAGE_SIZE, sort, ...filters });
  const summaryQuery = usePaymentsSummary(filters);
  const summary = summaryQuery.data;

  const clients = useClientOptions();
  const orders = useOrderOptionsByClient(form.client_id || null);
  const createPayment = useCreatePayment();
  const updatePayment = useUpdatePayment();
  const deletePayment = useDeletePayment();

  const clientOptions = (clients.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const orderOptions = (orders.data ?? []).map((o) => ({ value: o.id, label: o.order_number }));

  const hasFilter = !!(dateFrom || dateTo || paymentMethod);

  function resetFilters() {
    setPaymentMethod("");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  }

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setShowForm(true);
  }

  function openEdit(payment: PaymentRead) {
    setEditing(payment);
    setForm({
      client_id: payment.client_id,
      order_id: payment.order_id,
      payment_date: payment.payment_date,
      amount: payment.amount,
      payment_method: payment.payment_method,
      comment: payment.comment ?? "",
    });
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.client_id) {
      setError("Выберите клиента");
      return;
    }
    if (!form.amount || Number(form.amount) <= 0) {
      setError("Укажите сумму больше нуля");
      return;
    }
    setError(null);
    const mutation = editing
      ? updatePayment.mutateAsync({
          id: editing.id,
          data: {
            order_id: form.order_id,
            payment_date: form.payment_date,
            amount: form.amount,
            payment_method: form.payment_method,
            comment: form.comment || null,
          },
        })
      : createPayment.mutateAsync({
          client_id: form.client_id,
          order_id: form.order_id,
          payment_date: form.payment_date,
          amount: form.amount,
          payment_method: form.payment_method,
          comment: form.comment || null,
        });
    mutation
      .then(() => setShowForm(false))
      .catch((err) => setError(apiErrorMessage(err, "Не удалось сохранить оплату")));
  }

  function handleDelete(payment: PaymentRead) {
    if (!window.confirm(`Удалить оплату на сумму ${formatCurrency(payment.amount)}?`)) return;
    deletePayment.mutate(payment.id);
  }

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const gridCols = isAdmin
    ? "minmax(0,1.5fr) 132px 152px minmax(0,1.2fr) 150px 96px"
    : "minmax(0,1.5fr) 132px 152px minmax(0,1.2fr) 150px";

  const kpis = [
    {
      label: "Получено за период",
      value: formatCurrency(summary?.total_amount ?? 0),
      valueColor: "#178a55",
      icon: Wallet,
      iconColor: "#1f9d63",
      iconBg: "rgba(31,157,99,0.14)",
    },
    {
      label: "Платежей",
      value: String(summary?.count ?? 0),
      valueColor: "#1c1c22",
      icon: Receipt,
      iconColor: "#3b82f6",
      iconBg: "rgba(59,130,246,0.14)",
    },
    {
      label: "Средний платёж",
      value: formatCurrency(summary?.average ?? 0),
      valueColor: "#1c1c22",
      icon: TrendingUp,
      iconColor: "#8b5cf6",
      iconBg: "rgba(139,92,246,0.14)",
    },
    {
      label: "Клиентов",
      value: String(summary?.client_count ?? 0),
      valueColor: "#1c1c22",
      icon: Users,
      iconColor: "#c47d1f",
      iconBg: "rgba(240,162,60,0.14)",
    },
  ];

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ===== FILTER / SORT BAR ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5">
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
        <div className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-1.5">
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

        <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          <button
            onClick={() => {
              setPaymentMethod("");
              setPage(1);
            }}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
              paymentMethod === ""
                ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                : "font-medium text-muted hover:text-text"
            )}
          >
            Все
          </button>
          {METHODS.map((m) => (
            <button
              key={m}
              onClick={() => {
                setPaymentMethod(m);
                setPage(1);
              }}
              className={clsx(
                "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                paymentMethod === m
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {paymentMethodMeta[m].short}
            </button>
          ))}
        </div>

        {hasFilter && (
          <button
            onClick={resetFilters}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-bg"
          >
            <X className="h-[14px] w-[14px]" strokeWidth={2.2} />
            Сбросить
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
          className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-white/80"
        >
          <ArrowUpDown className="h-[15px] w-[15px]" strokeWidth={1.9} />
          Дата · {sort === "desc" ? "сначала новые" : "сначала старые"}
        </button>
      </div>

      {/* ===== KPI STRIP ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="glass flex items-center justify-between gap-3 rounded-3xl p-4">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[12px] font-medium text-muted">{k.label}</div>
              <div
                className="mt-1.5 text-[23px] font-bold tracking-tight tabular-nums"
                style={{ color: k.valueColor }}
              >
                {summaryQuery.isLoading ? "…" : k.value}
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

      {/* ===== TABLE CARD ===== */}
      <div className="glass flex min-h-0 flex-1 flex-col rounded-3xl p-5">
        <div className="flex items-center gap-3 pb-4">
          <h3 className="text-[16px] font-bold tracking-tight text-text">Поступления от клиентов</h3>
          <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
            {total} {total === 1 ? "платёж" : "платежей"}
          </span>
          <div className="flex-1" />
          <button
            disabled
            title="Скоро"
            className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-[12.5px] font-medium text-muted opacity-60"
          >
            <Download className="h-[15px] w-[15px]" strokeWidth={1.9} />
            Экспорт
          </button>
          <Button onClick={openCreate} className="!px-4 !py-2 !text-[12.5px]">
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.3} />
            Добавить платёж
          </Button>
        </div>

        {/* Десктоп (lg+) — таблица с горизонтальным скроллом */}
        <div className="hidden min-h-0 flex-1 overflow-x-auto lg:block">
          <div className="flex h-full min-w-[820px] flex-col lg:min-w-0">
        {/* column header */}
        <div
          className="grid gap-3 border-b border-border px-3 pb-2.5"
          style={{ gridTemplateColumns: gridCols }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Клиент</span>
          <button
            onClick={() => setSort((s) => (s === "desc" ? "asc" : "desc"))}
            className="flex items-center gap-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.04em] text-primary"
          >
            Дата
            <ArrowUpDown className="h-3 w-3" strokeWidth={2.2} />
          </button>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Способ</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Назначение</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Сумма</span>
          {isAdmin && <span />}
        </div>

        {/* rows */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : rows.length === 0 ? (
            <div className="py-12 text-center text-[13.5px] text-muted">Оплаты не найдены</div>
          ) : (
            rows.map((p) => {
              const meta = paymentMethodMeta[p.payment_method];
              const name = p.client?.name ?? "—";
              return (
                <div
                  key={p.id}
                  className="grid items-center gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-white/50"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <a
                    href={`/clients/${p.client_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Открыть статистику клиента в новой вкладке"
                    className="group flex min-w-0 items-center gap-3"
                  >
                    <div
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[12.5px] font-semibold text-white shadow-[0_4px_10px_rgba(40,50,90,0.12)]"
                      style={{ background: avatarGradient(name) }}
                    >
                      {initialsOf(name)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-[13.5px] font-semibold text-text decoration-primary/40 underline-offset-2 group-hover:text-primary group-hover:underline">
                        {name}
                      </div>
                      <div className="truncate text-[11.5px] text-muted">
                        {p.client?.company_name ?? "—"}
                      </div>
                    </div>
                  </a>
                  <span className="text-[13px] text-text/65">{formatDayMonth(p.payment_date)}</span>
                  <span
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                    {meta.short}
                  </span>
                  <span className="truncate text-[13px] text-text/70">{purposeOf(p)}</span>
                  <span className="text-right text-[14px] font-bold tabular-nums text-success">
                    +{formatCurrency(p.amount)}
                  </span>
                  {isAdmin && (
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => openEdit(p)}
                        title="Изменить"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/70 hover:text-text"
                      >
                        <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        title="Удалить"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger-bg"
                      >
                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
          </div>
        </div>

        {/* Телефон/планшет (< lg) — карточки + поп-ап */}
        <MobileCardList
          rows={rows}
          keyField={(p) => p.id}
          isLoading={isLoading}
          emptyMessage="Оплаты не найдены"
          renderCard={(p) => {
            const meta = paymentMethodMeta[p.payment_method];
            const name = p.client?.name ?? "—";
            return (
              <button
                type="button"
                onClick={() => setSelected(p)}
                className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
              >
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[12.5px] font-semibold text-white shadow-[0_4px_10px_rgba(40,50,90,0.12)]"
                  style={{ background: avatarGradient(name) }}
                >
                  {initialsOf(name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="truncate text-[13.5px] font-semibold text-text">{name}</span>
                  <span
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{ background: meta.bg, color: meta.color, borderColor: meta.border }}
                  >
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: meta.dot }} />
                    {meta.short}
                  </span>
                  <span className="truncate text-xs text-muted">
                    {formatDayMonth(p.payment_date)} · {purposeOf(p)}
                  </span>
                </div>
                <span className="shrink-0 text-[14px] font-bold tabular-nums text-success">
                  +{formatCurrency(p.amount)}
                </span>
              </button>
            );
          }}
        />

        {/* footer / pagination */}
        {!isLoading && total > 0 && (
          <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-[12.5px] text-muted">
            <span>
              Показано {from}–{to} из {total}
            </span>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                ‹ Назад
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={to >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                Вперёд ›
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* ===== ADD / EDIT MODAL ===== */}
      <Modal
        open={showForm}
        title={editing ? "Редактировать платёж" : "Новый платёж"}
        size="md"
        onClose={() => setShowForm(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">Клиент</label>
            <Combobox
              value={form.client_id || null}
              onChange={(v) => setForm({ ...form, client_id: v ?? "", order_id: null })}
              options={clientOptions}
              placeholder="Выбрать клиента"
              disabled={!!editing}
              allowClear={false}
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">Заказ (необязательно)</label>
            <Combobox
              value={form.order_id}
              onChange={(v) => setForm({ ...form, order_id: v })}
              options={orderOptions}
              placeholder={form.client_id ? "Выбрать заказ" : "Сначала выберите клиента"}
              disabled={!form.client_id}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-muted">Дата оплаты</label>
              <input
                type="date"
                value={form.payment_date}
                onChange={(e) => setForm({ ...form, payment_date: e.target.value })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-muted">Сумма, ₸</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm font-semibold outline-none focus:border-primary/50"
              />
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">Способ оплаты</label>
            <div className="flex flex-wrap gap-2">
              {METHODS.map((m) => {
                const meta = paymentMethodMeta[m];
                const active = form.payment_method === m;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setForm({ ...form, payment_method: m })}
                    className={clsx(
                      "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] transition-colors",
                      active
                        ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.1)]"
                        : "bg-white/50 font-medium text-muted hover:bg-white/70"
                    )}
                    style={{ borderColor: active ? meta.border : "rgba(255,255,255,0.7)" }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: meta.dot }} />
                    {meta.short}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold text-muted">Назначение / комментарий</label>
            <input
              type="text"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              placeholder="Напр. Аванс по договору"
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50"
            />
          </div>

          {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

          <div className="mt-1 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={createPayment.isPending || updatePayment.isPending}>
              {editing ? "Сохранить" : "Добавить платёж"}
            </Button>
          </div>
        </form>
      </Modal>

      <DetailModal
        open={!!selected}
        title={selected?.client?.name ?? "Платёж"}
        onClose={() => setSelected(null)}
        fields={
          selected
            ? [
                { label: "Дата", value: formatDayMonth(selected.payment_date) },
                { label: "Способ", value: paymentMethodMeta[selected.payment_method].short },
                {
                  label: "Сумма",
                  value: <span className="font-semibold text-success">+{formatCurrency(selected.amount)}</span>,
                },
                { label: "Назначение", value: purposeOf(selected), full: true },
              ]
            : []
        }
        actions={
          selected &&
          isAdmin && (
            <>
              <Button
                className="flex-1 justify-center"
                onClick={() => {
                  const p = selected;
                  setSelected(null);
                  openEdit(p);
                }}
              >
                Изменить
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const p = selected;
                  setSelected(null);
                  handleDelete(p);
                }}
              >
                Удалить
              </Button>
            </>
          )
        }
      />
    </div>
  );
}
