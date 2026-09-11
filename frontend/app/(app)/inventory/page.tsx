"use client";

import { clsx } from "clsx";
import { ChevronRight, CheckCircle2, Pencil, RotateCcw, Search, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { DeltaPill } from "@/components/inventory/DeltaPill";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { apiErrorMessage } from "@/lib/api/http";
import { useCan } from "@/lib/auth/permissions";
import { useApplyInventory, useInventoryHistory, useInventoryItems } from "@/lib/hooks/useStock";
import { ItemType, Permission } from "@/lib/types/enums";
import type { InventoryHistoryRead, InventoryItemRead, InventoryResult } from "@/lib/types/stock";
import { formatDateTime, formatQuantity } from "@/lib/utils/format";
import {
  RAW_MATERIAL_CATEGORY,
  RAW_MATERIAL_SUBCATEGORIES,
  SPUNBOND_SUBCATEGORIES,
  rawSubcategoryOf,
} from "@/lib/utils/productCategories";
import { CATEGORY_COLOR, CATEGORY_ORDER, CATEGORY_SHORT } from "@/lib/utils/shiftRawRules";

/**
 * Инвентаризация: склад в виде таблицы, где по кнопке «Изменить» количество каждой
 * позиции становится полем ввода. Пользователь вводит фактический остаток, а приход
 * или расход на разницу проводит бэкенд (POST /stock/inventory) — одной транзакцией,
 * с проверкой, что остаток не изменился, пока его редактировали. Каждое проведение —
 * документ во вкладке «История» (результат — страница /inventory/[id]).
 */

const SPUNBOND = "Спанбонд";
const RAW_CHIP_COLOR = "#c47d1f";
const HISTORY_PAGE_SIZE = 20;

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** У товара и сырья id из разных таблиц — ключ строки включает тип. */
const keyOf = (row: InventoryItemRead) => `${row.item_type}-${row.item_id}`;

/** Сравниваем в тысячных (точность склада — 3 знака), чтобы не ловить ошибки float. */
const toMilli = (v: number) => Math.round(v * 1000);

/** «12,5» / «12.5» / «1 250» → число; пусто, минус, буквы, > 3 знаков после запятой → null. */
function parseQty(raw: string): number | null {
  const s = raw.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{0,3})?$/.test(s)) return null;
  return Number(s);
}

const inputFormat = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 3, useGrouping: false });

interface Change {
  row: InventoryItemRead;
  before: number;
  after: number;
  delta: number;
}

function categoryMeta(row: InventoryItemRead): { label: string; color: string | null } {
  const known = CATEGORY_ORDER.find((c) => norm(c) === norm(row.category));
  if (known) return { label: CATEGORY_SHORT[known] ?? known, color: CATEGORY_COLOR[known] ?? "#5b8def" };
  return { label: row.category ?? (row.item_type === ItemType.MATERIAL ? "Сырьё" : "—"), color: null };
}

function CategoryPill({ row }: { row: InventoryItemRead }) {
  const { label, color } = categoryMeta(row);
  return (
    <span
      className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
      style={
        color
          ? { color, background: rgba(color, 0.13), borderColor: rgba(color, 0.26) }
          : { color: "rgba(40,40,60,0.6)", background: "rgba(255,255,255,0.6)", borderColor: "rgba(40,40,60,0.14)" }
      }
    >
      {color && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />}
      <span className="truncate">{label}</span>
    </span>
  );
}

/** «приход: 2 · расход: 1» — счётчики документа истории (подписаны: на телефоне нет шапки). */
function InOutCounts({ row }: { row: InventoryHistoryRead }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-end gap-1.5 whitespace-nowrap text-[12px] tabular-nums">
      {row.in_count > 0 && (
        <span className="rounded-full bg-success-bg px-2 py-0.5 font-semibold text-success">приход: {row.in_count}</span>
      )}
      {row.out_count > 0 && (
        <span className="rounded-full bg-danger-bg px-2 py-0.5 font-semibold text-danger">расход: {row.out_count}</span>
      )}
    </span>
  );
}

export default function InventoryPage() {
  const router = useRouter();
  const canInventory = useCan(Permission.STOCK_INVENTORY);
  const [tab, setTab] = useState<"stock" | "history">("stock");
  const [historyPage, setHistoryPage] = useState(1);
  const inventory = useInventoryItems(canInventory);
  const history = useInventoryHistory(historyPage, HISTORY_PAGE_SIZE, canInventory && tab === "history");
  const applyInventory = useApplyInventory();

  // Вкладка живёт в адресе (?tab=history): «‹ К истории» со страницы результата и
  // обновление страницы возвращают туда же. Читаем после монтирования — без
  // useSearchParams, которому в Next нужна Suspense-обёртка.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "history") setTab("history");
  }, []);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"in" | "all">("in");

  const [editing, setEditing] = useState(false);
  // Черновик: ключ строки → текст поля как есть (с запятой, недописанный и т.п.).
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [comment, setComment] = useState("");
  // Ошибка сервера при проведении — показывается в окне подтверждения.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Нажали «Сохранить» при красных полях — подсказка висит, пока они есть.
  const [showInvalid, setShowInvalid] = useState(false);
  const [result, setResult] = useState<InventoryResult | null>(null);

  const rows = useMemo(() => inventory.data ?? [], [inventory.data]);
  const byKey = useMemo(() => new Map(rows.map((r) => [keyOf(r), r])), [rows]);

  // Что реально изменится. Считается от текущих данных с сервера: если после 409
  // таблица перезагрузилась, «было» и разница пересчитаются сами.
  const { changes, invalidKeys } = useMemo(() => {
    const list: Change[] = [];
    const invalid = new Set<string>();
    for (const [key, raw] of Object.entries(drafts)) {
      const row = byKey.get(key);
      if (!row) continue;
      const after = parseQty(raw);
      if (after === null) {
        invalid.add(key);
        continue;
      }
      const before = Number(row.quantity);
      const delta = toMilli(after) - toMilli(before);
      if (delta !== 0) list.push({ row, before, after, delta: delta / 1000 });
    }
    list.sort((a, b) => a.row.name.localeCompare(b.row.name, "ru"));
    return { changes: list, invalidKeys: invalid };
  }, [drafts, byKey]);
  const changeByKey = useMemo(() => new Map(changes.map((c) => [keyOf(c.row), c])), [changes]);
  const inCount = changes.filter((c) => c.delta > 0).length;
  const outCount = changes.length - inCount;

  // Несохранённые правки не должны теряться при закрытии/перезагрузке вкладки.
  const dirty = editing && Object.keys(drafts).length > 0;
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  // ===== Фильтры (как на странице «Остатки») =====
  const isRawView = categoryFilter === RAW_MATERIAL_CATEGORY;
  const filtered = useMemo(() => {
    let list = rows;
    if (isRawView) {
      list = list.filter((r) => r.item_type === ItemType.MATERIAL);
      if (subcategoryFilter) list = list.filter((r) => rawSubcategoryOf(r) === subcategoryFilter);
    } else if (categoryFilter) {
      list = list.filter((r) => r.item_type === ItemType.PRODUCT && norm(r.category) === norm(categoryFilter));
      if (categoryFilter === SPUNBOND && subcategoryFilter) {
        list = list.filter((r) => norm(r.subcategory) === norm(subcategoryFilter));
      }
    }
    const query = norm(search);
    if (query) list = list.filter((r) => norm(r.name).includes(query));
    return list;
  }, [rows, isRawView, categoryFilter, subcategoryFilter, search]);

  const outOfStockCount = filtered.filter((r) => Number(r.quantity) <= 0).length;

  // «В наличии» фильтруется по остатку с сервера, а не по черновику — строка, которой
  // ввели 0, не пропадает из-под курсора до сохранения.
  const visible = useMemo(() => {
    const list = availability === "in" ? filtered.filter((r) => Number(r.quantity) > 0) : filtered;
    return [...list].sort((a, b) => {
      if (a.item_type !== b.item_type) return a.item_type === ItemType.PRODUCT ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [filtered, availability]);

  const query = search.trim();
  const searchHitsAnywhere = query ? rows.filter((r) => norm(r.name).includes(norm(query))).length : 0;
  const hiddenByFilters = query !== "" && visible.length === 0 && searchHitsAnywhere > 0;
  const emptyText = query ? `По запросу «${query}» ничего не найдено` : "Позиций не найдено";

  const categoryChips = [
    { id: null as string | null, label: "Все категории", color: "rgba(40,40,60,0.3)" },
    ...CATEGORY_ORDER.map((c) => ({ id: c, label: c, color: CATEGORY_COLOR[c] ?? "#5b8def" })),
    { id: RAW_MATERIAL_CATEGORY, label: RAW_MATERIAL_CATEGORY, color: RAW_CHIP_COLOR },
  ];
  const subChips = isRawView ? RAW_MATERIAL_SUBCATEGORIES : categoryFilter === SPUNBOND ? SPUNBOND_SUBCATEGORIES : null;

  function switchTab(next: "stock" | "history") {
    if (next === tab) return;
    // Уход в «Историю» из режима правки: несохранённое не должно пропасть молча.
    if (editing) {
      if (changes.length > 0 && !window.confirm("Отменить все несохранённые изменения?")) return;
      setDrafts({});
      setEditing(false);
      setComment("");
      setShowInvalid(false);
    }
    setTab(next);
    window.history.replaceState(null, "", next === "history" ? "/inventory?tab=history" : "/inventory");
  }

  // ===== Редактирование =====
  function startEditing() {
    setEditing(true);
    setResult(null);
    setShowInvalid(false);
  }

  function cancelEditing() {
    if (changes.length > 0 && !window.confirm("Отменить все несохранённые изменения?")) return;
    setDrafts({});
    setEditing(false);
    setComment("");
    setShowInvalid(false);
  }

  function setDraft(key: string, value: string) {
    setDrafts((d) => ({ ...d, [key]: value }));
  }

  function revert(key: string) {
    setDrafts((d) => {
      const next = { ...d };
      delete next[key];
      return next;
    });
  }

  // Ушли из поля с пустым значением или вернули исходное — это не правка.
  function handleBlur(row: InventoryItemRead) {
    const key = keyOf(row);
    const raw = drafts[key];
    if (raw === undefined) return;
    const value = parseQty(raw);
    if (raw.trim() === "" || (value !== null && toMilli(value) === toMilli(Number(row.quantity)))) revert(key);
  }

  // Enter/↓ — к следующей позиции, ↑ — к предыдущей, Esc — вернуть как было.
  // Таблица (десктоп) и карточки (телефон) обе в DOM — берём только видимые поля.
  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>, row: InventoryItemRead) {
    if (e.key === "Escape") {
      revert(keyOf(row));
      e.currentTarget.blur();
      return;
    }
    const step = e.key === "Enter" || e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>("input[data-inv-input]")).filter(
      (el) => el.offsetParent !== null
    );
    const next = inputs[inputs.indexOf(e.currentTarget) + step];
    if (next) {
      next.focus();
      next.select();
    } else if (e.key === "Enter") {
      e.currentTarget.blur();
    }
  }

  function openReview() {
    if (invalidKeys.size > 0) {
      setShowInvalid(true);
      return;
    }
    if (changes.length === 0) return;
    setSaveError(null);
    setReviewOpen(true);
  }

  function closeReview() {
    if (applyInventory.isPending) return;
    setReviewOpen(false);
    setSaveError(null);
  }

  function submit() {
    setSaveError(null);
    applyInventory.mutate(
      {
        items: changes.map((c) => ({
          item_type: c.row.item_type,
          item_id: c.row.item_id,
          quantity: String(c.after),
          expected_quantity: c.row.quantity,
        })),
        comment: comment.trim() || null,
      },
      {
        onSuccess: (res) => {
          setResult(res);
          setDrafts({});
          setEditing(false);
          setReviewOpen(false);
          setComment("");
        },
        onError: (err) => setSaveError(apiErrorMessage(err, "Не удалось провести инвентаризацию")),
      }
    );
  }

  function renderQtyInput(row: InventoryItemRead, className?: string) {
    const key = keyOf(row);
    const raw = drafts[key];
    const invalid = invalidKeys.has(key);
    const changed = changeByKey.has(key);
    return (
      <span className={clsx("inline-flex items-center gap-1.5", className)}>
        <input
          data-inv-input
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label={`Остаток: ${row.name}`}
          value={raw ?? inputFormat.format(Number(row.quantity))}
          onChange={(e) => setDraft(key, e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onBlur={() => handleBlur(row)}
          onKeyDown={(e) => handleKeyDown(e, row)}
          className={clsx(
            "w-[104px] rounded-lg border-[1.5px] px-2.5 py-1.5 text-right text-[14px] font-bold tabular-nums text-text outline-none transition-colors",
            invalid
              ? "border-danger bg-danger-bg"
              : changed
              ? "border-primary/60 bg-white"
              : "border-border bg-white/70 hover:border-primary/40 focus:border-primary/60 focus:bg-white"
          )}
        />
        <span className="text-[11.5px] text-muted">{row.unit}</span>
      </span>
    );
  }

  function renderQtyText(row: InventoryItemRead) {
    const qty = Number(row.quantity);
    return (
      <span className="whitespace-nowrap">
        <span className={clsx("text-[14px] font-bold tabular-nums", qty < 0 ? "text-danger" : "text-text")}>
          {formatQuantity(qty)}
        </span>
        <span className="text-[11.5px] text-muted"> {row.unit}</span>
      </span>
    );
  }

  function renderDelta(row: InventoryItemRead) {
    const key = keyOf(row);
    const change = changeByKey.get(key);
    if (!change) return <span className="text-[13px] text-muted/60">—</span>;
    return (
      <span className="flex items-center gap-1.5">
        <DeltaPill delta={change.delta} unit={row.unit} />
        <button
          type="button"
          onClick={() => revert(key)}
          title="Вернуть как было"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/70 hover:text-text"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2.2} />
        </button>
      </span>
    );
  }

  if (!canInventory) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        Нет доступа: инвентаризация доступна только супер-админу.
      </p>
    );
  }

  const COLS = editing
    ? "grid grid-cols-[minmax(220px,1.8fr)_minmax(140px,1fr)_170px_150px] items-center gap-3"
    : "grid grid-cols-[minmax(220px,1.8fr)_minmax(140px,1fr)_170px] items-center gap-3";
  const headCls = "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";

  const searchHint = hiddenByFilters ? (
    <button
      type="button"
      onClick={() => {
        setCategoryFilter(null);
        setSubcategoryFilter(null);
        setAvailability("all");
      }}
      className="mt-2 rounded-lg bg-white/70 px-3 py-1.5 text-[12.5px] font-medium text-primary transition-colors hover:bg-white"
    >
      Найдено в других разделах: {searchHitsAnywhere} — показать
    </button>
  ) : null;

  // ===== История: список документов =====
  const historyTotal = history.data?.total ?? 0;
  const historyFrom = historyTotal === 0 ? 0 : (historyPage - 1) * HISTORY_PAGE_SIZE + 1;
  const historyTo = Math.min(historyPage * HISTORY_PAGE_SIZE, historyTotal);
  const openDoc = (row: InventoryHistoryRead) => router.push(`/inventory/${row.id}`);

  const historyColumns: DataTableColumn<InventoryHistoryRead>[] = [
    { header: "Дата", cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.created_at)}</span> },
    { header: "Провёл", cell: (row) => row.created_by_name ?? "—" },
    {
      header: "Комментарий",
      cell: (row) =>
        row.comment ? (
          <span className="block max-w-[320px] truncate" title={row.comment}>
            {row.comment}
          </span>
        ) : (
          <span className="text-muted/60">—</span>
        ),
    },
    { header: "Позиций", align: "right", cell: (row) => <span className="font-semibold">{row.positions}</span> },
    { header: "Приход / расход", align: "right", cell: (row) => <InOutCounts row={row} /> },
    {
      header: "",
      align: "right",
      cell: () => <ChevronRight className="ml-auto h-4 w-4 text-muted" strokeWidth={2} />,
    },
  ];

  const historyFooter = (
    <>
      <span>{historyTotal === 0 ? "Нет данных" : `Показано ${historyFrom}–${historyTo} из ${historyTotal}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((p) => p - 1)}>
          ‹ Назад
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={historyTo >= historyTotal}
          onClick={() => setHistoryPage((p) => p + 1)}
        >
          Вперёд ›
        </Button>
      </div>
    </>
  );

  const historyView = history.isError ? (
    <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
      {apiErrorMessage(history.error, "Не удалось загрузить историю")}
    </p>
  ) : history.isLoading ? (
    <div className="flex justify-center py-10">
      <Spinner />
    </div>
  ) : (
    <>
      <div className="hidden lg:block">
        <DataTable
          columns={historyColumns}
          rows={history.data?.items ?? []}
          keyField={(row) => row.id}
          emptyMessage="Инвентаризаций пока не было"
          footer={historyFooter}
          onRowClick={openDoc}
        />
      </div>
      <MobileCardList
        rows={history.data?.items ?? []}
        keyField={(row) => row.id}
        emptyMessage="Инвентаризаций пока не было"
        footer={historyFooter}
        renderCard={(row) => (
          <button
            type="button"
            onClick={() => openDoc(row)}
            className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[13.5px] font-semibold text-text">{formatDateTime(row.created_at)}</span>
              <span className="text-[12px] text-muted">
                {row.created_by_name ?? "—"} · позиций: {row.positions}
              </span>
              {row.comment && <span className="truncate text-[12.5px] text-text">{row.comment}</span>}
            </div>
            <InOutCounts row={row} />
            <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
          </button>
        )}
      />
    </>
  );

  return (
    <div className={clsx("flex flex-col gap-4", editing && "pb-28 lg:pb-24")}>
      {/* ===== TOP BAR: вкладки + поиск + «Изменить» ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="inline-flex rounded-xl border border-white/60 bg-white/55 p-1 text-[12.5px]">
          {([
            { v: "stock", l: "Склад" },
            { v: "history", l: "История" },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => switchTab(t.v)}
              className={clsx(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                tab === t.v ? "bg-white text-text shadow-sm" : "text-muted hover:text-text"
              )}
            >
              {t.l}
            </button>
          ))}
        </div>

        {tab === "history" && (
          <span className="text-[12.5px] text-muted">Каждая строка — одно проведение. Нажмите, чтобы открыть результат.</span>
        )}

        {tab === "stock" && (
          <>
            <div className="relative w-full sm:w-72">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                strokeWidth={2}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Поиск по наименованию…"
                className="w-full rounded-xl border-[1.5px] border-border bg-white/70 py-1.5 pl-9 pr-8 text-[13px] text-text outline-none focus:border-primary/50"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  title="Очистить поиск"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-muted transition-colors hover:bg-black/[0.06] hover:text-text"
                >
                  <X className="h-3.5 w-3.5" strokeWidth={2.4} />
                </button>
              )}
            </div>

            <div className="inline-flex rounded-xl bg-white/45 p-0.5">
              {([
                { v: "in", l: "В наличии", t: "Только позиции с остатком" },
                {
                  v: "all",
                  l: `Все${outOfStockCount > 0 ? ` (+${outOfStockCount})` : ""}`,
                  t: "Показать все позиции, включая нулевые — им тоже можно задать остаток",
                },
              ] as const).map((o) => (
                <button
                  key={o.v}
                  onClick={() => setAvailability(o.v)}
                  title={o.t}
                  className={clsx(
                    "rounded-lg px-3 py-1.5 text-[13px] transition-colors",
                    availability === o.v ? "bg-white font-semibold text-text shadow-sm" : "font-medium text-muted hover:text-text"
                  )}
                >
                  {o.l}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {editing ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-[12.5px] font-semibold text-primary">
                <Pencil className="h-3.5 w-3.5" strokeWidth={2.2} />
                Режим правки
              </span>
            ) : (
              <Button onClick={startEditing} disabled={inventory.isLoading || inventory.isError}>
                <Pencil className="h-4 w-4" strokeWidth={2.2} />
                Изменить
              </Button>
            )}
          </>
        )}
      </div>

      {tab === "history" && historyView}

      {tab === "stock" && inventory.isError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
          {apiErrorMessage(inventory.error, "Не удалось загрузить склад")}
        </p>
      )}

      {tab === "stock" && !inventory.isError && (
        <>
          {/* ===== CATEGORY CHIPS ===== */}
          <div className="glass flex flex-wrap items-center gap-1.5 self-stretch rounded-2xl p-1.5 sm:inline-flex sm:self-start">
            {categoryChips.map((c) => (
              <button
                key={c.id ?? "all"}
                onClick={() => {
                  setCategoryFilter(c.id);
                  setSubcategoryFilter(null);
                }}
                className={clsx(
                  "inline-flex items-center gap-2 rounded-xl px-3.5 py-1.5 text-[13px] transition-colors",
                  categoryFilter === c.id ? "bg-white/90 font-semibold text-text shadow-sm" : "font-medium text-muted hover:text-text"
                )}
              >
                <span className="h-[9px] w-[9px] rounded-full" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>

          {subChips && (
            <div className="glass flex flex-col gap-2 self-stretch rounded-2xl p-2.5 sm:flex-row sm:items-center sm:gap-3 sm:self-start">
              <span className="px-1 text-[12px] font-semibold text-muted">Подкатегория</span>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: null as string | null, label: "Все" }, ...subChips.map((s) => ({ id: s, label: s }))].map((s) => (
                  <button
                    key={s.id ?? "all"}
                    onClick={() => setSubcategoryFilter(s.id)}
                    className={clsx(
                      "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                      subcategoryFilter === s.id ? "bg-white font-semibold text-text shadow-sm" : "bg-white/50 text-muted hover:text-text"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ===== Итог последнего проведения ===== */}
          {result && (
            <div className="flex items-start gap-3 rounded-2xl border border-success/20 bg-success-bg px-4 py-3 text-[13px] text-text">
              <CheckCircle2 className="mt-0.5 h-[18px] w-[18px] shrink-0 text-success" strokeWidth={2.2} />
              <div className="min-w-0 flex-1">
                {result.changes.length === 0 ? (
                  "Изменений не было — склад уже совпадал с введёнными значениями."
                ) : (
                  <>
                    <span className="font-semibold">Проведено.</span> Изменено позиций: {result.changes.length}.{" "}
                    {result.inventory_id && (
                      <Link href={`/inventory/${result.inventory_id}`} className="font-semibold text-primary hover:underline">
                        Открыть результат ›
                      </Link>
                    )}{" "}
                    Все инвентаризации — во вкладке «История».
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setResult(null)}
                title="Скрыть"
                className="rounded-md p-0.5 text-muted transition-colors hover:bg-black/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" strokeWidth={2.2} />
              </button>
            </div>
          )}

          {showInvalid && invalidKeys.size > 0 && (
            <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">
              Исправьте значения, выделенные красным: нужно число не меньше нуля, не больше трёх знаков после запятой.
            </p>
          )}

          {/* ===== ТАБЛИЦА ===== */}
          <div className="glass flex flex-col rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <h3 className="text-[16px] font-bold tracking-tight text-text">Склад</h3>
              <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
                {visible.length}
              </span>
              {editing && (
                <span className="w-full text-[12.5px] text-muted sm:w-auto">
                  Кликните по количеству и введите фактический остаток — разницу система проведёт приходом или расходом.
                </span>
              )}
            </div>

            {inventory.isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[680px]">
                  <div className={clsx(COLS, "border-b border-black/[0.08] px-3 pb-2.5")}>
                    <span className={headCls}>Наименование</span>
                    <span className={headCls}>Категория</span>
                    <span className={headCls}>{editing ? "Фактический остаток" : "Остаток"}</span>
                    {editing && <span className={headCls}>Изменение</span>}
                  </div>

                  {visible.length === 0 ? (
                    <div className="flex flex-col items-center py-12">
                      <p className="text-center text-sm text-muted">{emptyText}</p>
                      {searchHint}
                    </div>
                  ) : (
                    visible.map((row) => {
                      const changed = changeByKey.has(keyOf(row));
                      return (
                        <div
                          key={keyOf(row)}
                          className={clsx(
                            COLS,
                            "rounded-2xl px-3 py-2.5 transition-colors",
                            changed ? "bg-primary-50/70" : "hover:bg-white/50"
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="truncate text-[13.5px] font-semibold text-text">{row.name}</span>
                            {!row.is_active && (
                              <span className="shrink-0 rounded-full bg-black/[0.05] px-2 py-0.5 text-[10.5px] font-medium text-muted">
                                неактивна
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-col gap-1">
                            <CategoryPill row={row} />
                            {row.subcategory && <span className="pl-0.5 text-[11px] text-muted">{row.subcategory}</span>}
                          </span>
                          {editing ? renderQtyInput(row) : renderQtyText(row)}
                          {editing && renderDelta(row)}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Телефон/планшет (< lg) — карточки; в режиме правки поле ввода прямо в карточке */}
            <MobileCardList
              rows={visible}
              keyField={keyOf}
              isLoading={inventory.isLoading}
              emptyMessage={emptyText}
              renderCard={(row) => {
                const change = changeByKey.get(keyOf(row));
                return (
                  <div
                    className={clsx(
                      "glass flex w-full items-center gap-3 rounded-3xl p-4",
                      change && "ring-[1.5px] ring-primary/40"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      {/* Без обрезки: «Простыни одноразовые 80х200» и «…90х200» должны различаться. */}
                      <span className="break-words text-[13.5px] font-semibold leading-snug text-text">{row.name}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <CategoryPill row={row} />
                        {change && <DeltaPill delta={change.delta} unit={row.unit} />}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {editing ? renderQtyInput(row) : renderQtyText(row)}
                      {change && (
                        <button
                          type="button"
                          onClick={() => revert(keyOf(row))}
                          className="inline-flex items-center gap-1 text-[11.5px] font-medium text-muted hover:text-text"
                        >
                          <RotateCcw className="h-3 w-3" strokeWidth={2.2} />
                          было {formatQuantity(change.before)}
                        </button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
            {searchHint && <div className="flex justify-center lg:hidden">{searchHint}</div>}
          </div>
        </>
      )}

      {/* ===== Плавающая панель сохранения (режим правки; есть только на вкладке «Склад») ===== */}
      {editing && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-30 flex justify-center px-3 lg:bottom-6 lg:left-[262px] lg:right-4">
          <div className="glass-strong pointer-events-auto flex w-full max-w-[680px] flex-wrap items-center gap-x-4 gap-y-2.5 rounded-2xl px-4 py-3 shadow-[0_12px_32px_rgba(40,50,90,0.18)]">
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[13.5px] font-semibold text-text">
                {changes.length === 0 ? "Изменений пока нет" : `Изменено позиций: ${changes.length}`}
              </span>
              <span className="text-[12px] text-muted">
                {invalidKeys.size > 0
                  ? `С ошибкой: ${invalidKeys.size} — исправьте красные поля`
                  : changes.length === 0
                  ? "Кликните по количеству, чтобы изменить"
                  : `Приход: ${inCount} · Расход: ${outCount}`}
              </span>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={cancelEditing}>
                Отмена
              </Button>
              <Button onClick={openReview} disabled={changes.length === 0 && invalidKeys.size === 0}>
                Сохранить
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Подтверждение: что именно будет проведено ===== */}
      <Modal open={reviewOpen} title="Проверьте изменения" onClose={closeReview}>
        <p className="mb-3 text-[13px] text-muted">
          Разницу система проведёт сама: излишек — приходом, недостачу — расходом. Движения появятся в «Остатки →
          Движения» с пометкой «Инвентаризация».
        </p>

        <div className="flex flex-col divide-y divide-black/[0.06] rounded-2xl border border-white/70 bg-white/55">
          {changes.map((c) => (
            <div key={keyOf(c.row)} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5">
              <span className="min-w-0 flex-1 basis-[180px] truncate text-[13.5px] font-semibold text-text">
                {c.row.name}
              </span>
              <span className="text-[12.5px] tabular-nums text-muted">
                {formatQuantity(c.before)} → <b className="text-text">{formatQuantity(c.after)}</b> {c.row.unit}
              </span>
              <DeltaPill delta={c.delta} unit={c.row.unit} withKind />
            </div>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[12.5px] text-muted">
          <span>
            Приходов: <b className="text-success">{inCount}</b>
          </span>
          <span>
            Расходов: <b className="text-danger">{outCount}</b>
          </span>
        </div>

        <label className="mb-1 mt-4 block text-[13px] font-semibold text-text">Комментарий (необязательно)</label>
        <input
          type="text"
          value={comment}
          maxLength={500}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Например: пересчёт склада после смены"
          className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50"
        />

        {saveError && <p className="mt-3 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{saveError}</p>}

        <div className="mt-4 flex gap-2">
          <Button onClick={submit} disabled={applyInventory.isPending || changes.length === 0}>
            {applyInventory.isPending ? "Проводим…" : "Провести"}
          </Button>
          <Button variant="secondary" onClick={closeReview} disabled={applyInventory.isPending}>
            Назад
          </Button>
        </div>
      </Modal>
    </div>
  );
}
