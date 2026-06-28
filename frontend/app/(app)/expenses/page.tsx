"use client";

import { clsx } from "clsx";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronRight,
  Layers,
  Pencil,
  Receipt,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DetailModal, modalPrimaryBtn } from "@/components/ui/DetailModal";
import { KpiCard } from "@/components/ui/KpiCard";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Spinner } from "@/components/ui/Spinner";
import { CreateExpenseModal } from "@/components/expenses/CreateExpenseModal";
import { useAuthStore } from "@/lib/auth/store";
import { useExpenseCategoryOptions } from "@/lib/hooks/useExpenseCategories";
import { useDeleteExpense, useExpensesList, useExpensesSummary } from "@/lib/hooks/useExpenses";
import type { ExpenseListItem } from "@/lib/types/expense";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import { categoryColor } from "@/lib/utils/expenseCategoryColors";
import { formatCurrency, formatDate } from "@/lib/utils/format";

const PAGE_SIZE = 20;

export default function ExpensesPage() {
  const router = useRouter();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === UserRole.SUPER_ADMIN;
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<"date" | "amount">("date");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<ExpenseListItem | null>(null);

  const categories = useExpenseCategoryOptions();
  const deleteExpense = useDeleteExpense();

  const filters = {
    category_id: categoryId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    search: search || undefined,
  };

  const { data, isLoading, isError, error } = useExpensesList({ page, size: PAGE_SIZE, sort, ...filters });
  const summary = useExpensesSummary(filters);

  function resetPage() {
    setPage(1);
  }

  function handleDelete(row: ExpenseListItem) {
    if (!window.confirm(`Удалить расход «${row.name}»? Действие необратимо.`)) return;
    deleteExpense.mutate(row.id);
  }

  const avgExpense =
    summary.data && summary.data.count > 0 ? Number(summary.data.total_amount) / summary.data.count : 0;

  const columns: DataTableColumn<ExpenseListItem>[] = [
    {
      header: "Описание",
      cell: (row) => {
        const color = row.category ? categoryColor(row.category.id) : null;
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white shadow-sm shadow-black/10"
              style={{ background: color?.gradient ?? "linear-gradient(140deg,#9aa0ae,#b7bcc6)" }}
            >
              <Receipt className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="flex min-w-0 flex-col">
              <Link href={`/expenses/${row.id}`} className="truncate font-medium text-text hover:text-primary">
                {row.name}
              </Link>
              {row.comment && <span className="truncate text-xs text-muted">{row.comment}</span>}
            </div>
          </div>
        );
      },
    },
    { header: "Дата", cell: (row) => formatDate(row.expense_date) },
    {
      header: "Категория",
      cell: (row) => {
        if (!row.category) return "—";
        const color = categoryColor(row.category.id);
        return (
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
              color.bg, color.text, color.border
            )}
          >
            <span className={clsx("h-1.5 w-1.5 rounded-full", color.dot)} />
            {row.category.name}
          </span>
        );
      },
    },
    { header: "Ответственный", cell: (row) => row.responsible?.full_name ?? "—" },
    { header: "Сумма", align: "right", cell: (row) => formatCurrency(row.amount) },
    {
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            href={`/expenses/${row.id}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-black/[0.04] hover:text-text"
          >
            <Pencil className="h-3.5 w-3.5" strokeWidth={2} />
          </Link>
          {isSuperAdmin && (
            <button
              onClick={() => handleDelete(row)}
              disabled={deleteExpense.isPending}
              className="flex h-7 w-7 items-center justify-center rounded-full text-muted hover:bg-danger-bg hover:text-danger disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" strokeWidth={2} />
            </button>
          )}
        </div>
      ),
    },
  ];

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const hasNext = to < total;
  const hasFilter = !!(search || categoryId || dateFrom || dateTo);
  const rows = data?.items ?? [];

  const paginationControls = (
    <>
      <span>{total === 0 ? "Нет расходов" : `Показано ${from}–${to} из ${total}`}</span>
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
            placeholder="Поиск по описанию или ответственному…"
            className="w-[240px] rounded-xl border border-white/40 bg-white/50 py-1.5 pl-9 pr-3 text-[13px] text-text outline-none focus:border-primary"
          />
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-white/40 bg-white/30 p-1">
          <button
            onClick={() => {
              setCategoryId("");
              resetPage();
            }}
            className={clsx(
              "rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
              categoryId === "" ? "bg-white/90 text-text shadow-sm" : "text-muted hover:text-text"
            )}
          >
            Все
          </button>
          {(categories.data ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => {
                setCategoryId(c.id);
                resetPage();
              }}
              className={clsx(
                "rounded-lg px-2.5 py-1.5 text-[12px] font-medium transition-colors",
                categoryId === c.id ? "bg-white/90 text-text shadow-sm" : "text-muted hover:text-text"
              )}
            >
              {c.name}
            </button>
          ))}
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

        {hasFilter && (
          <button
            onClick={() => {
              setSearch("");
              setCategoryId("");
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
          onClick={() => setSort((s) => (s === "date" ? "amount" : "date"))}
          className="flex items-center gap-2 rounded-xl border border-white/40 bg-white/50 px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:bg-white/70"
        >
          <ArrowUpDown className="h-3.5 w-3.5" strokeWidth={2} />
          {sort === "date" ? "По дате" : "По сумме"}
        </button>
      </div>

      {(isError || summary.isError) && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {apiErrorMessage(error ?? summary.error, "Не удалось загрузить расходы")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <KpiCard
          label="Всего за период"
          value={summary.data ? formatCurrency(summary.data.total_amount) : "—"}
          tone="primary"
          icon={Wallet}
          hint={summary.data ? `${summary.data.count} расходов` : undefined}
        />
        <KpiCard
          label="Категорий"
          value={summary.data ? String(summary.data.category_count) : "—"}
          tone="neutral"
          icon={Layers}
        />
        <KpiCard
          label="Средний расход"
          value={summary.data ? formatCurrency(avgExpense) : "—"}
          tone="success"
          icon={TrendingUp}
        />
        <KpiCard
          label="Расходов"
          value={summary.data ? String(summary.data.count) : "—"}
          tone="warning"
          icon={Receipt}
        />
      </div>

      <div className="glass rounded-3xl p-5 shadow-xl shadow-black/5">
        <div className="mb-4 flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-text">Статьи расходов</h3>
          <span className="rounded-full border border-white/40 bg-white/40 px-2.5 py-1 text-[11.5px] font-medium text-muted">
            {total} расход{total === 1 ? "" : "ов"}
          </span>
          <div className="flex-1" />
          <Button onClick={() => setShowCreate(true)}>Добавить расход</Button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-10">
            <Spinner />
          </div>
        ) : (
          <>
            {/* Десктоп (lg+) — таблица */}
            <div className="hidden lg:block">
              <DataTable
                columns={columns}
                rows={rows}
                keyField={(row) => row.id}
                emptyMessage="Расходы не найдены"
                footer={paginationControls}
              />
            </div>

            {/* Телефон/планшет (< lg) — карточки + поп-ап */}
            <MobileCardList
              rows={rows}
              keyField={(row) => row.id}
              emptyMessage="Расходы не найдены"
              footer={paginationControls}
              renderCard={(row) => {
                const color = row.category ? categoryColor(row.category.id) : null;
                return (
                  <button
                    type="button"
                    onClick={() => setSelected(row)}
                    className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white shadow-sm shadow-black/10"
                      style={{ background: color?.gradient ?? "linear-gradient(140deg,#9aa0ae,#b7bcc6)" }}
                    >
                      <Receipt className="h-[18px] w-[18px]" strokeWidth={2} />
                    </span>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate text-[14px] font-semibold text-text">{row.name}</span>
                      <span className="truncate text-xs text-muted">
                        {row.category?.name ?? "Без категории"} · {formatDate(row.expense_date)}
                      </span>
                      {row.responsible && (
                        <span className="truncate text-xs text-muted">{row.responsible.full_name}</span>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="font-bold tabular-nums text-text">{formatCurrency(row.amount)}</span>
                      <ChevronRight className="h-4 w-4 text-muted" strokeWidth={2} />
                    </div>
                  </button>
                );
              }}
            />
          </>
        )}
      </div>

      <DetailModal
        open={!!selected}
        title={selected?.name ?? ""}
        onClose={() => setSelected(null)}
        fields={
          selected
            ? [
                { label: "Дата", value: formatDate(selected.expense_date) },
                { label: "Категория", value: selected.category?.name ?? "—" },
                { label: "Ответственный", value: selected.responsible?.full_name ?? "—" },
                { label: "Сумма", value: formatCurrency(selected.amount) },
                ...(selected.comment ? [{ label: "Комментарий", value: selected.comment, full: true }] : []),
              ]
            : []
        }
        actions={
          selected && (
            <>
              <Link href={`/expenses/${selected.id}`} className={modalPrimaryBtn}>
                Открыть полностью
                <ChevronRight className="h-4 w-4" strokeWidth={2} />
              </Link>
              {isSuperAdmin && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const row = selected;
                    setSelected(null);
                    handleDelete(row);
                  }}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={2} /> Удалить
                </Button>
              )}
            </>
          )
        }
      />

      <CreateExpenseModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(expenseId) => router.push(`/expenses/${expenseId}`)}
      />
    </div>
  );
}
