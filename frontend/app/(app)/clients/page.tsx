"use client";

import { clsx } from "clsx";
import {
  AlertCircle,
  ArrowUpDown,
  ChevronRight,
  Download,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  Truck,
  UserCheck,
  Users,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { DetailModal, modalPrimaryBtn } from "@/components/ui/DetailModal";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import {
  useClientsOverview,
  useCreateClient,
  useDeleteClient,
  useUpdateClient,
} from "@/lib/hooks/useClients";
import { useManagerOptions } from "@/lib/hooks/useManagerOptions";
import { usePaymentsList } from "@/lib/hooks/usePayments";
import { useShipmentsList } from "@/lib/hooks/useShipments";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import type { ClientOverviewRow, ClientRead, ClientStatus } from "@/lib/types/client";
import { formatCompactCurrency, formatCurrency, formatDate, formatDayMonth } from "@/lib/utils/format";
import { avatarGradient, initialsOf } from "@/lib/utils/paymentMethodMeta";

type SortKey = "name" | "amount" | "date";

const STATUS_META: Record<ClientStatus, { label: string; color: string; bg: string; border: string }> = {
  active: { label: "Активный", color: "#178a55", bg: "rgba(31,157,99,0.12)", border: "rgba(31,157,99,0.22)" },
  lead: { label: "Лид", color: "#3f6fd6", bg: "rgba(91,141,239,0.13)", border: "rgba(91,141,239,0.26)" },
  inactive: { label: "Неактивный", color: "rgba(40,40,60,0.5)", bg: "rgba(40,40,60,0.07)", border: "rgba(40,40,60,0.14)" },
};

const STATUS_TABS: { id: ClientStatus | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "active", label: "Активные" },
  { id: "lead", label: "Лиды" },
  { id: "inactive", label: "Неактивные" },
];

const SORT_LABEL: Record<SortKey, string> = { name: "По имени", amount: "По сумме", date: "По активности" };

interface FormState {
  name: string;
  phone: string;
  email: string;
  company_name: string;
  address: string;
  comment: string;
  manager_id: string | null;
}

const emptyForm: FormState = {
  name: "",
  phone: "",
  email: "",
  company_name: "",
  address: "",
  comment: "",
  manager_id: null,
};

export default function ClientsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ClientStatus | "all">("all");
  const [debtOnly, setDebtOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>("amount");

  const [editing, setEditing] = useState<ClientRead | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const [shipmentsFor, setShipmentsFor] = useState<ClientOverviewRow | null>(null);
  const [reconcileFor, setReconcileFor] = useState<ClientOverviewRow | null>(null);
  const [selected, setSelected] = useState<ClientOverviewRow | null>(null);

  const { data: rows, isLoading } = useClientsOverview();
  const managers = useManagerOptions(isAdmin);
  const managerOptions = (managers.data ?? []).map((m) => ({ value: m.id, label: m.full_name }));

  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const all = rows ?? [];
  const debtCount = all.filter((r) => Number(r.debt) > 0).length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (debtOnly && Number(r.debt) <= 0) return false;
      if (q) {
        const hay = `${r.client.name} ${r.client.company_name ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "amount") return Number(b.total_shipped) - Number(a.total_shipped);
      if (sort === "date") return (b.last_activity ?? "").localeCompare(a.last_activity ?? "");
      return a.client.name.localeCompare(b.client.name, "ru");
    });
  }, [all, search, statusFilter, debtOnly, sort]);

  const kpis = [
    { label: "Всего клиентов", value: String(all.length), valueColor: "#1c1c22", icon: Users, iconColor: "#5b8def", iconBg: "rgba(91,141,239,0.14)" },
    { label: "Активных", value: String(all.filter((r) => r.status === "active").length), valueColor: "#178a55", icon: UserCheck, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
    { label: "Лидов", value: String(all.filter((r) => r.status === "lead").length), valueColor: "#6d52cc", icon: Zap, iconColor: "#8d6bff", iconBg: "rgba(141,107,255,0.14)" },
    { label: "Оборот клиентов", value: formatCompactCurrency(all.reduce((s, r) => s + Number(r.total_shipped), 0)), valueColor: "#c47d1f", icon: Wallet, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
  ];

  const hasFilter = !!(search || statusFilter !== "all" || debtOnly);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setShowForm(true);
  }

  function openEdit(client: ClientRead) {
    setEditing(client);
    setForm({
      name: client.name,
      phone: client.phone ?? "",
      email: client.email ?? "",
      company_name: client.company_name ?? "",
      address: client.address ?? "",
      comment: client.comment ?? "",
      manager_id: client.manager_id,
    });
    setError(null);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setError("Укажите имя клиента");
      return;
    }
    const payload = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      company_name: form.company_name || null,
      address: form.address || null,
      comment: form.comment || null,
      manager_id: form.manager_id,
    };
    const mutation = editing
      ? updateClient.mutateAsync({ id: editing.id, data: payload })
      : createClient.mutateAsync(payload);
    mutation
      .then(() => setShowForm(false))
      .catch((err) => setError(apiErrorMessage(err, "Не удалось сохранить клиента")));
  }

  function handleDelete(client: ClientRead) {
    if (!window.confirm(`Удалить клиента «${client.name}»?`)) return;
    deleteClient.mutate(client.id);
  }

  const gridCols = "minmax(0,2fr) 150px 84px 132px 124px 116px 112px";

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ===== FILTER BAR ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2">
          <Search className="h-[15px] w-[15px] text-muted" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или компании…"
            className="w-full border-none bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          {STATUS_TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setStatusFilter(t.id)}
              className={clsx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                statusFilter === t.id
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setDebtOnly((v) => !v)}
          className={clsx(
            "flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] font-semibold transition-colors",
            debtOnly
              ? "border-danger/30 bg-danger-bg text-danger"
              : "border-white/70 bg-white/60 text-muted hover:text-text"
          )}
        >
          <AlertCircle className="h-[14px] w-[14px]" strokeWidth={2.1} />
          С долгом · {debtCount}
        </button>

        {hasFilter && (
          <button
            onClick={() => {
              setSearch("");
              setStatusFilter("all");
              setDebtOnly(false);
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-bg"
          >
            <X className="h-[14px] w-[14px]" strokeWidth={2.2} /> Сбросить
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setSort((s) => (s === "name" ? "amount" : s === "amount" ? "date" : "name"))}
          className="flex items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-[12.5px] font-semibold text-primary transition-colors hover:bg-white/80"
        >
          <ArrowUpDown className="h-[15px] w-[15px]" strokeWidth={1.9} />
          {SORT_LABEL[sort]}
        </button>
      </div>

      {/* ===== KPI STRIP ===== */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="glass flex items-center justify-between gap-3 rounded-3xl p-4">
            <div className="min-w-0">
              <div className="whitespace-nowrap text-[12px] font-medium text-muted">{k.label}</div>
              <div className="mt-1.5 text-[23px] font-bold tracking-tight tabular-nums" style={{ color: k.valueColor }}>
                {isLoading ? "…" : k.value}
              </div>
            </div>
            <span className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-[13px]" style={{ background: k.iconBg }}>
              <k.icon className="h-5 w-5" strokeWidth={2} style={{ color: k.iconColor }} />
            </span>
          </div>
        ))}
      </div>

      {/* ===== TABLE CARD ===== */}
      <div className="glass flex min-h-0 flex-1 flex-col rounded-3xl p-5">
        <div className="flex flex-wrap items-center gap-3 pb-4">
          <h3 className="text-[16px] font-bold tracking-tight text-text">База клиентов</h3>
          <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
            {filtered.length} из {all.length}
          </span>
          <div className="flex-1" />
          <button
            disabled
            title="Скоро"
            className="hidden items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-[12.5px] font-medium text-muted opacity-60 sm:flex"
          >
            <Download className="h-[15px] w-[15px]" strokeWidth={1.9} /> Экспорт
          </button>
          <Button onClick={openCreate} className="!px-4 !py-2 !text-[12.5px]">
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.3} /> Добавить клиента
          </Button>
        </div>

        {/* Десктоп (lg+) — таблица с горизонтальным скроллом */}
        <div className="hidden min-h-0 flex-1 overflow-x-auto lg:block">
          <div className="flex h-full min-w-[860px] flex-col lg:min-w-0">
        {/* column header */}
        <div className="grid gap-3 border-b border-border px-3 pb-2.5" style={{ gridTemplateColumns: gridCols }}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Клиент</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Телефон</span>
          <span className="text-center text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Сделок</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Оборот</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Активность</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Статус</span>
          <span />
        </div>

        {/* rows */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center text-muted">
              <Users className="h-11 w-11 opacity-40" strokeWidth={1.5} />
              <div className="text-[14px] font-semibold text-text/70">Клиенты не найдены</div>
              <div className="text-[12.5px]">Измените фильтры или добавьте нового клиента</div>
            </div>
          ) : (
            filtered.map((r) => {
              const c = r.client;
              const debt = Number(r.debt);
              const sm = STATUS_META[r.status];
              return (
                <div
                  key={c.id}
                  className="grid items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/50"
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[13px] font-semibold text-white shadow-[0_4px_10px_rgba(40,50,90,0.14)]"
                      style={{ background: avatarGradient(c.name) }}
                    >
                      {initialsOf(c.name)}
                    </div>
                    <div className="min-w-0">
                      <a
                        href={`/clients/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Открыть статистику клиента в новой вкладке"
                        className="block truncate text-[13.5px] font-semibold text-text decoration-primary/40 underline-offset-2 hover:text-primary hover:underline"
                      >
                        {c.name}
                      </a>
                      <div className="truncate text-[11.5px] text-muted">{c.company_name ?? "—"}</div>
                      {debt > 0 && (
                        <span className="mt-1 inline-flex items-center rounded-full border border-danger/25 bg-danger-bg px-2 py-0.5 text-[11px] font-semibold text-danger">
                          Долг: {formatCompactCurrency(debt)}
                        </span>
                      )}
                      {debt < 0 && (
                        <span className="mt-1 inline-flex items-center rounded-full border border-primary/25 bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary">
                          Переплата: {formatCompactCurrency(Math.abs(debt))}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="truncate text-[12.5px] text-text/65">{c.phone ?? "—"}</span>
                  <span className="text-center text-[14px] font-bold tabular-nums text-text">
                    {r.order_count > 0 ? r.order_count : "—"}
                  </span>
                  {Number(r.total_shipped) > 0 ? (
                    <button
                      onClick={() => setShipmentsFor(r)}
                      title="Показать отгрузки"
                      className="text-right text-[14px] font-bold tabular-nums text-primary underline decoration-primary/40 decoration-dotted underline-offset-2 hover:decoration-primary"
                    >
                      {formatCompactCurrency(r.total_shipped)}
                    </button>
                  ) : (
                    <span className="text-right text-[14px] font-bold tabular-nums text-muted">—</span>
                  )}
                  <span className="text-[12.5px] text-text/55">{formatDate(r.last_activity)}</span>
                  <span
                    className="inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}
                  >
                    {sm.label}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    <button
                      onClick={() => setReconcileFor(r)}
                      title="Акт сверки"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      <FileText className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </button>
                    <button
                      onClick={() => openEdit(c)}
                      title="Изменить"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/70 hover:text-text"
                    >
                      <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                    </button>
                    {isAdmin && (
                      <button
                        onClick={() => handleDelete(c)}
                        title="Удалить"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-danger transition-colors hover:bg-danger-bg"
                      >
                        <Trash2 className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
          </div>
        </div>

        {/* Телефон/планшет (< lg) — карточки + поп-ап */}
        <MobileCardList
          rows={filtered}
          keyField={(r) => r.client.id}
          isLoading={isLoading}
          emptyMessage="Клиенты не найдены"
          renderCard={(r) => {
            const c = r.client;
            const debt = Number(r.debt);
            const sm = STATUS_META[r.status];
            return (
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[13px] font-semibold text-white shadow-[0_4px_10px_rgba(40,50,90,0.14)]"
                  style={{ background: avatarGradient(c.name) }}
                >
                  {initialsOf(c.name)}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[13.5px] font-semibold text-text">{c.name}</span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                      style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}
                    >
                      {sm.label}
                    </span>
                  </div>
                  <span className="truncate text-xs text-muted">{c.company_name ?? c.phone ?? "—"}</span>
                  {debt > 0 ? (
                    <span className="text-xs font-semibold text-danger">Долг: {formatCompactCurrency(debt)}</span>
                  ) : debt < 0 ? (
                    <span className="text-xs font-semibold text-primary">
                      Переплата: {formatCompactCurrency(Math.abs(debt))}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">
                      Оборот: {formatCompactCurrency(Number(r.total_shipped))}
                    </span>
                  )}
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
              </button>
            );
          }}
        />
      </div>

      {/* ===== ADD / EDIT MODAL ===== */}
      <Modal open={showForm} title={editing ? "Редактировать клиента" : "Новый клиент"} size="lg" onClose={() => setShowForm(false)}>
        <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3.5">
          <Field className="col-span-2" label="Имя клиента">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Напр. Алмас Нурланов"
              className={inputCls}
            />
          </Field>
          <Field label="Компания">
            <input value={form.company_name} onChange={(e) => setForm({ ...form, company_name: e.target.value })} placeholder="ТОО «Название»" className={inputCls} />
          </Field>
          <Field label="Телефон">
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+7 700 000-00-00" className={inputCls} />
          </Field>
          <Field label="Email">
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email@company.kz" className={inputCls} />
          </Field>
          <Field label="Адрес">
            <input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Город, улица" className={inputCls} />
          </Field>
          {isAdmin && (
            <Field className="col-span-2" label="Менеджер (необязательно)">
              <Combobox
                value={form.manager_id}
                onChange={(v) => setForm({ ...form, manager_id: v })}
                options={managerOptions}
                placeholder="Не назначен"
              />
            </Field>
          )}
          <Field className="col-span-2" label="Комментарий">
            <input value={form.comment} onChange={(e) => setForm({ ...form, comment: e.target.value })} placeholder="Заметка о клиенте" className={inputCls} />
          </Field>

          {error && <p className="col-span-2 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

          <div className="col-span-2 mt-1 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={createClient.isPending || updateClient.isPending}>
              {editing ? "Сохранить" : "Добавить клиента"}
            </Button>
          </div>
        </form>
      </Modal>

      <DetailModal
        open={!!selected}
        title={selected?.client.name ?? ""}
        onClose={() => setSelected(null)}
        subtitle={
          selected && (
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-white/70 text-[15px] font-semibold text-white shadow-[0_4px_10px_rgba(40,50,90,0.14)]"
                style={{ background: avatarGradient(selected.client.name) }}
              >
                {initialsOf(selected.client.name)}
              </div>
              <div className="min-w-0">
                {selected.client.company_name && (
                  <div className="truncate text-[12.5px] text-muted">{selected.client.company_name}</div>
                )}
                <span
                  className="mt-0.5 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold"
                  style={{
                    background: STATUS_META[selected.status].bg,
                    color: STATUS_META[selected.status].color,
                    borderColor: STATUS_META[selected.status].border,
                  }}
                >
                  {STATUS_META[selected.status].label}
                </span>
              </div>
            </div>
          )
        }
        fields={
          selected
            ? [
                { label: "Телефон", value: selected.client.phone ?? "—" },
                { label: "Сделок", value: selected.order_count > 0 ? String(selected.order_count) : "—" },
                { label: "Оборот", value: formatCurrency(selected.total_shipped) },
                { label: "Оплачено", value: formatCurrency(selected.total_paid) },
                {
                  label: "Баланс",
                  value: (() => {
                    const d = Number(selected.debt);
                    if (d > 0) return <span className="font-semibold text-danger">Долг {formatCompactCurrency(d)}</span>;
                    if (d < 0)
                      return (
                        <span className="font-semibold text-primary">
                          Переплата {formatCompactCurrency(Math.abs(d))}
                        </span>
                      );
                    return "Закрыт";
                  })(),
                },
                { label: "Активность", value: formatDate(selected.last_activity) },
              ]
            : []
        }
        actions={
          selected && (
            <>
              <a
                href={`/clients/${selected.client.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={modalPrimaryBtn}
              >
                Открыть полностью
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </a>
              {Number(selected.total_shipped) > 0 && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const r = selected;
                    setSelected(null);
                    setShipmentsFor(r);
                  }}
                >
                  <Truck className="h-4 w-4" strokeWidth={1.9} /> Отгрузки
                </Button>
              )}
              <Button
                variant="secondary"
                onClick={() => {
                  const r = selected;
                  setSelected(null);
                  setReconcileFor(r);
                }}
              >
                <FileText className="h-4 w-4" strokeWidth={1.9} /> Акт сверки
              </Button>
              <Button
                onClick={() => {
                  const r = selected;
                  setSelected(null);
                  openEdit(r.client);
                }}
              >
                <Pencil className="h-4 w-4" strokeWidth={1.9} /> Изменить
              </Button>
            </>
          )
        }
      />

      {shipmentsFor && (
        <ShipmentsModal
          row={shipmentsFor}
          onClose={() => setShipmentsFor(null)}
          onReconcile={() => {
            setReconcileFor(shipmentsFor);
            setShipmentsFor(null);
          }}
        />
      )}
      {reconcileFor && <ReconcileModal row={reconcileFor} onClose={() => setReconcileFor(null)} />}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50";

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label className="text-[12px] font-semibold text-muted">{label}</label>
      {children}
    </div>
  );
}

/** Полупрозрачный оверлей со стеклянной карточкой по центру (для модалок отгрузок и сверки). */
function Overlay({ children, onClose, maxWidth }: { children: React.ReactNode; onClose: () => void; maxWidth: number }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(28,32,52,0.3)] p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth }}
        className="glass-strong flex max-h-[88vh] w-full flex-col overflow-hidden rounded-[24px] animate-[modalIn_0.22s_ease]"
      >
        {children}
      </div>
    </div>
  );
}

function ClientChip({ row }: { row: ClientOverviewRow }) {
  const c = row.client;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="flex h-7 w-7 items-center justify-center rounded-full border-[1.5px] border-white/70 text-[11px] font-bold text-white"
        style={{ background: avatarGradient(c.name) }}
      >
        {initialsOf(c.name)}
      </div>
      <span className="text-[13.5px] font-semibold text-text">{c.name}</span>
      {c.company_name && <span className="text-[12px] text-muted">{c.company_name}</span>}
    </div>
  );
}

function ShipmentsModal({
  row,
  onClose,
  onReconcile,
}: {
  row: ClientOverviewRow;
  onClose: () => void;
  onReconcile: () => void;
}) {
  const { data, isLoading } = useShipmentsList({ client_id: row.client.id, size: 100 });
  const shipments = data?.items ?? [];
  const grid = "108px 92px minmax(0,1fr) 130px";

  return (
    <Overlay onClose={onClose} maxWidth={720}>
      <div className="flex items-start justify-between gap-3 px-6 pt-6 pb-4">
        <div>
          <h3 className="text-[18px] font-bold tracking-tight text-text">Отгрузки клиента</h3>
          <div className="mt-2 flex items-center gap-2.5">
            <ClientChip row={row} />
            <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
              {data?.total ?? shipments.length} всего
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onReconcile}>
            <FileText className="h-4 w-4" /> Акт сверки
          </Button>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/60 text-muted hover:bg-white/80" aria-label="Закрыть">
            <X className="h-4 w-4" strokeWidth={2.2} />
          </button>
        </div>
      </div>

      <div className="grid gap-3 border-b border-border px-6 pb-2.5" style={{ gridTemplateColumns: grid }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Номер</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Дата</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Заказ</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Сумма</span>
      </div>

      <div className="overflow-y-auto px-3 pb-4">
        {isLoading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : shipments.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted">
            <Truck className="h-9 w-9 opacity-40" strokeWidth={1.5} />
            <div className="text-[13.5px] font-semibold text-text/70">Отгрузок нет</div>
          </div>
        ) : (
          shipments.map((sh) => (
            <a
              key={sh.id}
              href={`/orders/${sh.order_id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="grid items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-white/60"
              style={{ gridTemplateColumns: grid }}
            >
              <span className="flex items-center gap-1.5 text-[13px] font-bold tabular-nums text-text">
                <Truck className="h-3.5 w-3.5 text-primary/60" strokeWidth={2} />
                {sh.shipment_number}
              </span>
              <span className="text-[12.5px] text-muted">{formatDayMonth(sh.shipment_date)}</span>
              <span className="truncate text-[12.5px] text-text">
                {sh.order ? `Заказ ${sh.order.order_number}` : "—"}
              </span>
              <span className="text-right text-[13.5px] font-bold tabular-nums text-text">
                {formatCurrency(sh.total_amount)}
              </span>
            </a>
          ))
        )}
      </div>
    </Overlay>
  );
}

interface LedgerRow {
  date: string;
  type: "ship" | "pay";
  note: string;
  amount: number;
  balance: number;
}

function ReconcileModal({ row, onClose }: { row: ClientOverviewRow; onClose: () => void }) {
  const ships = useShipmentsList({ client_id: row.client.id, size: 100 });
  const pays = usePaymentsList({ client_id: row.client.id, size: 100 });
  const loading = ships.isLoading || pays.isLoading;

  const ledger = useMemo<LedgerRow[]>(() => {
    const tx = [
      ...(ships.data?.items ?? []).map((s) => ({
        date: s.shipment_date,
        type: "ship" as const,
        note: s.order ? `${s.shipment_number} · Заказ ${s.order.order_number}` : s.shipment_number,
        amount: Number(s.total_amount),
      })),
      ...(pays.data?.items ?? []).map((p) => ({
        date: p.payment_date,
        type: "pay" as const,
        note: p.comment?.trim() || (p.order ? `Оплата · Заказ ${p.order.order_number}` : "Оплата"),
        amount: Number(p.amount),
      })),
    ].sort((a, b) => a.date.localeCompare(b.date));
    let bal = 0;
    return tx.map((t) => {
      bal += t.type === "ship" ? t.amount : -t.amount;
      return { ...t, balance: bal };
    });
  }, [ships.data, pays.data]);

  const totalShipped = Number(row.total_shipped);
  const totalPaid = Number(row.total_paid);
  const balance = Number(row.debt);
  const balanceLabel = balance > 0 ? "Долг клиента" : balance < 0 ? "Переплата клиента" : "Расчёты закрыты";
  const balanceColor = balance > 0 ? "#bd4836" : balance < 0 ? "#3f6fd6" : "#178a55";
  const grid = "96px 92px minmax(0,1fr) 132px 120px";

  return (
    <Overlay onClose={onClose} maxWidth={760}>
      {/* header */}
      <div className="flex items-center gap-3 border-b border-border px-6 py-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-indigo text-white shadow-[0_6px_16px_rgba(91,107,255,0.3)]">
          <FileText className="h-[18px] w-[18px]" strokeWidth={2} />
        </span>
        <div className="flex-1">
          <h3 className="text-[17px] font-bold tracking-tight text-text">Акт сверки</h3>
          <div className="mt-1">
            <ClientChip row={row} />
          </div>
        </div>
        <div className="rounded-2xl border px-4 py-2 text-right" style={{ borderColor: `${balanceColor}38`, background: `${balanceColor}14`, color: balanceColor }}>
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.05em] opacity-75">{balanceLabel}</div>
          <div className="text-[18px] font-bold tracking-tight tabular-nums">{formatCurrency(Math.abs(balance))}</div>
        </div>
        <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/70 bg-white/60 text-muted hover:bg-white/80" aria-label="Закрыть">
          <X className="h-4 w-4" strokeWidth={2.2} />
        </button>
      </div>

      {/* summary */}
      <div className="grid grid-cols-3 gap-3 px-6 py-4">
        <div className="rounded-2xl border border-danger/20 bg-danger-bg px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Отгружено</div>
          <div className="mt-1 text-[17px] font-bold tabular-nums text-danger">{formatCurrency(totalShipped)}</div>
        </div>
        <div className="rounded-2xl border border-success/20 bg-success-bg px-4 py-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">Оплачено</div>
          <div className="mt-1 text-[17px] font-bold tabular-nums text-success">{formatCurrency(totalPaid)}</div>
        </div>
        <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${balanceColor}30`, background: `${balanceColor}12` }}>
          <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-muted">{balanceLabel}</div>
          <div className="mt-1 text-[17px] font-bold tabular-nums" style={{ color: balanceColor }}>
            {formatCurrency(Math.abs(balance))}
          </div>
        </div>
      </div>

      {/* ledger header */}
      <div className="grid gap-3 border-b border-border px-6 pb-2" style={{ gridTemplateColumns: grid }}>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Дата</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Тип</span>
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Описание</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Сумма</span>
        <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Баланс</span>
      </div>

      {/* ledger rows */}
      <div className="flex-1 overflow-y-auto px-6 py-1">
        {loading ? (
          <div className="flex justify-center py-12">
            <Spinner />
          </div>
        ) : ledger.length === 0 ? (
          <div className="py-12 text-center text-[13px] text-muted">Операций по клиенту нет</div>
        ) : (
          ledger.map((t, i) => {
            const isShip = t.type === "ship";
            return (
              <div key={i} className="grid items-center gap-3 border-b border-border/50 py-2.5" style={{ gridTemplateColumns: grid }}>
                <span className="text-[12.5px] text-muted">{formatDayMonth(t.date)}</span>
                <span
                  className={clsx(
                    "inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11.5px] font-semibold",
                    isShip ? "border-danger/25 bg-danger-bg text-danger" : "border-success/25 bg-success-bg text-success"
                  )}
                >
                  {isShip ? "Отгрузка" : "Оплата"}
                </span>
                <span className="truncate text-[13px] text-text">{t.note}</span>
                <span className={clsx("text-right text-[13px] font-bold tabular-nums", isShip ? "text-danger" : "text-success")}>
                  {isShip ? "+ " : "− "}
                  {formatCurrency(t.amount)}
                </span>
                <span
                  className="text-right text-[13px] font-bold tabular-nums"
                  style={{ color: t.balance > 0 ? "#bd4836" : t.balance < 0 ? "#3f6fd6" : "#178a55" }}
                >
                  {formatCurrency(Math.abs(t.balance))}
                </span>
              </div>
            );
          })
        )}
      </div>

      <div className="flex justify-end border-t border-border px-6 py-4">
        <Button variant="secondary" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </Overlay>
  );
}
