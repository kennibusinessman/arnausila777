"use client";

import { clsx } from "clsx";
import {
  AlertTriangle,
  Boxes,
  ChevronRight,
  FlaskConical,
  Package,
  Plus,
  Scale,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DetailModal } from "@/components/ui/DetailModal";
import { KpiCard } from "@/components/ui/KpiCard";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { ProductFormModal } from "@/components/products/ProductFormModal";
import { MaterialFormModal } from "@/components/materials/MaterialFormModal";
import { useAuthStore } from "@/lib/auth/store";
import { useMaterialOptions } from "@/lib/hooks/useMaterials";
import { useProductOptions } from "@/lib/hooks/useProducts";
import {
  useCreateAdjustment,
  useDeleteStockMovement,
  useStockBalances,
  useStockMovements,
} from "@/lib/hooks/useStock";
import { useWarehouseOptions } from "@/lib/hooks/useWarehouses";
import { apiErrorMessage } from "@/lib/api/http";
import { AdjustmentDirection, type StockMovementRead } from "@/lib/types/stock";
import type { ProductRead } from "@/lib/types/product";
import type { MaterialRead } from "@/lib/types/material";
import { ItemType, MovementType, UserRole } from "@/lib/types/enums";
import { formatDateTime, formatNumber, formatWeight } from "@/lib/utils/format";
import { movementTypeLabels, sourceTypeLabels } from "@/lib/utils/stockLabels";
import {
  RAW_MATERIAL_CATEGORY,
  RAW_MATERIAL_SUBCATEGORIES,
  SPUNBOND_SUBCATEGORIES,
  rawSubcategoryOf,
} from "@/lib/utils/productCategories";
import { CATEGORY_COLOR, CATEGORY_ORDER, CATEGORY_SHORT } from "@/lib/utils/shiftRawRules";
import { FINISHED_WAREHOUSE_TYPES, RAW_WAREHOUSE_TYPES, pickWarehouseId } from "@/lib/utils/warehouseResolution";

const PAGE_SIZE = 20;
const DASTARKHAN = "Дастархан";
const SPUNBOND = "Спанбонд";
const RAW_CHIP_COLOR = "#c47d1f";

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

type StockStatus = "ok" | "low" | "out";
const STATUS_META: Record<StockStatus, { label: string; cls: string }> = {
  ok: { label: "В наличии", cls: "bg-success-bg text-success" },
  low: { label: "Заканчивается", cls: "bg-warning-bg text-warning" },
  out: { label: "Нет в наличии", cls: "bg-danger-bg text-danger" },
};

interface AggregatedBalance {
  key: string;
  item_type: ItemType;
  product_id: string | null;
  material_id: string | null;
  name: string;
  category: string | null;
  subcategory: string | null;
  unit: string;
  quantity: number;
  min_stock: number;
  base_weight: number | null;
}

interface AdjustForm {
  item_type: ItemType;
  product_id: string;
  material_id: string;
  quantity: string;
  direction: AdjustmentDirection;
  unit: string;
  unit_cost: string;
  comment: string;
}

const emptyAdjustForm: AdjustForm = {
  item_type: ItemType.PRODUCT,
  product_id: "",
  material_id: "",
  quantity: "",
  direction: AdjustmentDirection.IN,
  unit: "",
  unit_cost: "",
  comment: "",
};

/** Статус позиции по остатку и порогу min_stock. */
function statusOf(row: AggregatedBalance): StockStatus {
  if (row.quantity <= 0) return "out";
  if (row.min_stock > 0 && row.quantity <= row.min_stock) return "low";
  return "ok";
}

/** Вес позиции в кг (для KPI и колонки «Вес»). Дастархан вес не учитывает. */
function weightKgOf(row: AggregatedBalance): number | null {
  if (row.item_type === ItemType.MATERIAL) return row.quantity; // сырьё, как правило, в кг
  if (norm(row.category) === norm(DASTARKHAN)) return null;
  if (!row.base_weight || row.base_weight <= 0) return null;
  return row.base_weight * row.quantity;
}

export default function StockPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isSuperAdmin = role === UserRole.SUPER_ADMIN;
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;

  const [tab, setTab] = useState<"balances" | "movements">("balances");
  const [cardProduct, setCardProduct] = useState<ProductRead | null>(null);
  const [cardMaterial, setCardMaterial] = useState<MaterialRead | null>(null);
  const [selectedBalance, setSelectedBalance] = useState<AggregatedBalance | null>(null);
  const [selectedMovement, setSelectedMovement] = useState<StockMovementRead | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [subcategoryFilter, setSubcategoryFilter] = useState<string | null>(null);
  const [movementType, setMovementType] = useState<MovementType | "">("");
  const [page, setPage] = useState(1);
  const [showAdjust, setShowAdjust] = useState(false);
  const [form, setForm] = useState<AdjustForm>(emptyAdjustForm);
  const [error, setError] = useState<string | null>(null);

  const warehouses = useWarehouseOptions();
  const products = useProductOptions();
  const materials = useMaterialOptions();
  const createAdjustment = useCreateAdjustment();
  const deleteMovement = useDeleteStockMovement();

  const productMap = useMemo(
    () => new Map((products.data ?? []).map((p) => [p.id, p])),
    [products.data]
  );
  const materialMap = useMemo(
    () => new Map((materials.data ?? []).map((m) => [m.id, m])),
    [materials.data]
  );

  function itemName(row: { item_type: ItemType; product_id: string | null; material_id: string | null }) {
    if (row.item_type === ItemType.PRODUCT) return productMap.get(row.product_id ?? "")?.name ?? "—";
    return materialMap.get(row.material_id ?? "")?.name ?? "—";
  }

  // Остатки не постраничные: один товар суммируется по всем складам в единый пул.
  const balances = useStockBalances({ size: 100 });
  const movements = useStockMovements({
    page,
    size: PAGE_SIZE,
    movement_type: movementType || undefined,
  });

  const aggregatedBalances = useMemo<AggregatedBalance[]>(() => {
    const map = new Map<string, AggregatedBalance>();
    for (const row of balances.data?.items ?? []) {
      const key = `${row.item_type}-${row.product_id ?? row.material_id}`;
      const existing = map.get(key);
      if (existing) {
        existing.quantity += Number(row.quantity);
      } else {
        const product = row.item_type === ItemType.PRODUCT ? productMap.get(row.product_id ?? "") : undefined;
        const material = row.item_type === ItemType.MATERIAL ? materialMap.get(row.material_id ?? "") : undefined;
        map.set(key, {
          key,
          item_type: row.item_type,
          product_id: row.product_id,
          material_id: row.material_id,
          name: product?.name ?? material?.name ?? "—",
          category: product?.category ?? material?.category ?? null,
          subcategory: product?.subcategory ?? null,
          unit: product?.unit ?? material?.unit ?? "",
          quantity: Number(row.quantity),
          min_stock: Number(product?.min_stock ?? material?.min_stock ?? 0),
          base_weight: product?.base_weight ? Number(product.base_weight) : null,
        });
      }
    }
    return Array.from(map.values());
  }, [balances.data, productMap, materialMap]);

  // «Сырьё» — это не значение category, а фильтр по типу позиции (все материалы).
  const isRawView = categoryFilter === RAW_MATERIAL_CATEGORY;

  // Фильтр по категории + подкатегории (Спанбонд → subcategory товара, Сырьё → category материала).
  const sortedBalances = useMemo(() => {
    let filtered: AggregatedBalance[];
    if (isRawView) {
      filtered = aggregatedBalances.filter((r) => r.item_type === ItemType.MATERIAL);
      if (subcategoryFilter) {
        filtered = filtered.filter((r) => rawSubcategoryOf(r) === subcategoryFilter);
      }
    } else if (categoryFilter) {
      filtered = aggregatedBalances.filter((r) => norm(r.category) === norm(categoryFilter));
      if (categoryFilter === SPUNBOND && subcategoryFilter) {
        filtered = filtered.filter((r) => norm(r.subcategory) === norm(subcategoryFilter));
      }
    } else {
      filtered = aggregatedBalances;
    }
    return [...filtered].sort((a, b) => {
      if (a.item_type !== b.item_type) return a.item_type === ItemType.PRODUCT ? -1 : 1;
      return a.name.localeCompare(b.name, "ru");
    });
  }, [aggregatedBalances, categoryFilter, subcategoryFilter, isRawView]);

  // KPI по текущему фильтру.
  const showWeight = categoryFilter !== DASTARKHAN;
  // «Общий вес товара» — только готовая продукция. Сырьё (в т.ч. Полипропилен)
  // в общий вес не входит — оно учитывается отдельной KPI «Сырьё ПП».
  // В разделе «Сырьё» считаем вес самих материалов (они в кг).
  const weightSum = sortedBalances.reduce(
    (s, r) =>
      s + (isRawView ? weightKgOf(r) ?? 0 : r.item_type === ItemType.PRODUCT ? weightKgOf(r) ?? 0 : 0),
    0
  );
  const piecesSum = sortedBalances.reduce((s, r) => s + (norm(r.unit) === "шт" ? r.quantity : 0), 0);
  const lowCount = sortedBalances.filter((r) => statusOf(r) === "low").length;
  // Запас сырья ПП (полипропилен) — глобально, независимо от фильтра.
  const ppKg = aggregatedBalances
    .filter((r) => r.item_type === ItemType.MATERIAL && norm(r.name).includes("полипропилен"))
    .reduce((s, r) => s + r.quantity, 0);

  const productOptions = (products.data ?? []).map((p) => ({ value: p.id, label: p.name, sublabel: p.unit }));
  const materialOptions = (materials.data ?? []).map((m) => ({ value: m.id, label: m.name, sublabel: m.unit }));

  function openAdjust() {
    setForm(emptyAdjustForm);
    setError(null);
    setShowAdjust(true);
  }

  // Клик по наименованию — полная карточка товара/материала (правка всех полей).
  function openCard(row: AggregatedBalance) {
    if (row.item_type === ItemType.PRODUCT) {
      const p = productMap.get(row.product_id ?? "");
      if (p) setCardProduct(p);
    } else {
      const m = materialMap.get(row.material_id ?? "");
      if (m) setCardMaterial(m);
    }
  }

  // Клик по стрелке строки — корректировка по этой позиции (прих/расх).
  function openAdjustFor(row: AggregatedBalance) {
    setForm({
      ...emptyAdjustForm,
      item_type: row.item_type,
      product_id: row.product_id ?? "",
      material_id: row.material_id ?? "",
      unit: row.unit,
    });
    setError(null);
    setShowAdjust(true);
  }

  function handleDeleteMovement(row: StockMovementRead) {
    if (
      !window.confirm(
        `Удалить движение «${movementTypeLabels[row.movement_type]}» (${formatNumber(row.quantity, 3)} ${row.unit})? Остаток будет скорректирован автоматически.`
      )
    )
      return;
    deleteMovement.mutate(row.id, {
      onError: (err) => window.alert(apiErrorMessage(err, "Не удалось удалить движение")),
    });
  }

  const movementColumns: DataTableColumn<StockMovementRead>[] = [
    { header: "Дата", cell: (row) => formatDateTime(row.created_at) },
    { header: "Наименование", cell: (row) => itemName(row) },
    {
      header: "Тип движения",
      cell: (row) => (
        <Badge
          label={movementTypeLabels[row.movement_type]}
          className={row.movement_type.endsWith("_IN") ? "bg-success-bg text-green-800" : "bg-danger-bg text-red-800"}
        />
      ),
    },
    { header: "Кол-во", align: "right", cell: (row) => `${formatNumber(row.quantity, 3)} ${row.unit}` },
    { header: "Источник", cell: (row) => sourceTypeLabels[row.source_type] },
    { header: "Комментарий", cell: (row) => row.comment ?? "—" },
    ...(isSuperAdmin
      ? [
          {
            header: "",
            align: "right" as const,
            cell: (row: StockMovementRead) => (
              <Button
                variant="ghost"
                size="sm"
                className="text-danger hover:bg-danger-bg"
                onClick={() => handleDeleteMovement(row)}
              >
                Удалить
              </Button>
            ),
          },
        ]
      : []),
  ];

  const total = movements.data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);

  const movementsFooter = (
    <>
      <span>{total === 0 ? "Нет данных" : `Показано ${from}–${to} из ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Назад
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
          Вперёд ›
        </Button>
      </div>
    </>
  );

  function handleAdjustSubmit(e: React.FormEvent) {
    e.preventDefault();
    const itemId = form.item_type === ItemType.PRODUCT ? form.product_id : form.material_id;
    if (!itemId) {
      setError("Выберите товар или материал");
      return;
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      setError("Укажите количество больше нуля");
      return;
    }
    if (!form.unit.trim()) {
      setError("Укажите единицу измерения");
      return;
    }
    const warehouseId = pickWarehouseId(
      warehouses.data ?? [],
      form.item_type === ItemType.PRODUCT ? FINISHED_WAREHOUSE_TYPES : RAW_WAREHOUSE_TYPES
    );
    if (!warehouseId) {
      setError("Не найден подходящий склад для этого типа — обратитесь к администратору");
      return;
    }
    setError(null);
    createAdjustment.mutate(
      {
        warehouse_id: warehouseId,
        item_type: form.item_type,
        product_id: form.item_type === ItemType.PRODUCT ? form.product_id : null,
        material_id: form.item_type === ItemType.MATERIAL ? form.material_id : null,
        quantity: form.quantity,
        direction: form.direction,
        unit: form.unit,
        unit_cost: form.unit_cost || null,
        comment: form.comment || null,
      },
      {
        onSuccess: () => {
          setShowAdjust(false);
          setForm(emptyAdjustForm);
        },
        onError: (err) => setError(apiErrorMessage(err, "Не удалось провести корректировку")),
      }
    );
  }

  const categoryChips = [
    { id: null as string | null, label: "Все категории", color: "rgba(40,40,60,0.3)" },
    ...CATEGORY_ORDER.map((c) => ({ id: c, label: c, color: CATEGORY_COLOR[c] ?? "#5b8def" })),
    { id: RAW_MATERIAL_CATEGORY, label: RAW_MATERIAL_CATEGORY, color: RAW_CHIP_COLOR },
  ];

  // Подкатегории текущего раздела (Спанбонд — формы выпуска, Сырьё — вид сырья).
  const subChips = isRawView
    ? RAW_MATERIAL_SUBCATEGORIES
    : categoryFilter === SPUNBOND
    ? SPUNBOND_SUBCATEGORIES
    : null;

  // Сетка таблицы остатков — общая для шапки и строк.
  const COLS =
    "grid grid-cols-[minmax(220px,1.7fr)_minmax(150px,1fr)_130px_120px_140px_28px] items-center gap-3";
  const headCls = "text-[11px] font-semibold uppercase tracking-[0.04em] text-muted";

  return (
    <div className="flex flex-col gap-4">
      {/* ===== TOP BAR: вкладки + действие ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="inline-flex rounded-xl border border-white/60 bg-white/55 p-1 text-[12.5px]">
          {([
            { v: "balances", l: "Остатки" },
            { v: "movements", l: "Движения" },
          ] as const).map((t) => (
            <button
              key={t.v}
              onClick={() => {
                setTab(t.v);
                setPage(1);
              }}
              className={clsx(
                "rounded-lg px-3.5 py-1.5 font-medium transition-colors",
                tab === t.v ? "bg-white text-text shadow-sm" : "text-muted hover:text-text"
              )}
            >
              {t.l}
            </button>
          ))}
        </div>

        {tab === "movements" && (
          <select
            value={movementType}
            onChange={(e) => {
              setMovementType(e.target.value as MovementType | "");
              setPage(1);
            }}
            className="rounded-xl border-[1.5px] border-border bg-white/70 px-2.5 py-1.5 text-[13px] text-text outline-none focus:border-primary/50"
          >
            <option value="">Все движения</option>
            {Object.values(MovementType).map((t) => (
              <option key={t} value={t}>
                {movementTypeLabels[t]}
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        <Button onClick={openAdjust}>
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          Оформить приход
        </Button>
      </div>

      {tab === "balances" ? (
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
                  categoryFilter === c.id
                    ? "bg-white/90 font-semibold text-text shadow-sm"
                    : "font-medium text-muted hover:text-text"
                )}
              >
                <span className="h-[9px] w-[9px] rounded-full" style={{ background: c.color }} />
                {c.label}
              </button>
            ))}
          </div>

          {/* ===== SUBCATEGORY CHIPS (Спанбонд / Сырьё) ===== */}
          {subChips && (
            <div className="glass flex flex-col gap-2 self-stretch rounded-2xl p-2.5 sm:flex-row sm:items-center sm:gap-3 sm:self-start">
              <span className="px-1 text-[12px] font-semibold text-muted">Подкатегория</span>
              <div className="flex flex-wrap gap-1.5">
                {[{ id: null as string | null, label: "Все" }, ...subChips.map((s) => ({ id: s, label: s }))].map(
                  (s) => (
                    <button
                      key={s.id ?? "all"}
                      onClick={() => setSubcategoryFilter(s.id)}
                      className={clsx(
                        "rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                        subcategoryFilter === s.id
                          ? "bg-white font-semibold text-text shadow-sm"
                          : "bg-white/50 text-muted hover:text-text"
                      )}
                    >
                      {s.label}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* ===== KPI STRIP ===== */}
          <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
            <KpiCard label="Позиций на складе" value={formatNumber(sortedBalances.length)} tone="primary" icon={Boxes} />
            {showWeight ? (
              <KpiCard
                label={isRawView ? "Общий вес сырья" : "Общий вес товара"}
                value={formatWeight(weightSum)}
                tone="neutral"
                icon={Scale}
              />
            ) : (
              <KpiCard label="Остаток, шт" value={`${formatNumber(piecesSum)} шт`} tone="success" icon={Package} />
            )}
            <KpiCard label="Заканчивается" value={formatNumber(lowCount)} tone="warning" icon={AlertTriangle} />
            <KpiCard label="Сырьё ПП" value={formatWeight(ppKg)} tone="neutral" icon={FlaskConical} />
          </div>

          {/* ===== STOCK TABLE ===== */}
          <div className="glass flex flex-col rounded-3xl p-5">
            <div className="flex flex-wrap items-center gap-3 pb-4">
              <h3 className="text-[16px] font-bold tracking-tight text-text">Складские остатки</h3>
              <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
                {sortedBalances.length}
              </span>
              <div className="flex-1" />
              <Button onClick={openAdjust}>
                <Plus className="h-4 w-4" strokeWidth={2.4} />
                Оформить приход
              </Button>
            </div>

            {balances.isLoading ? (
              <div className="flex justify-center py-12">
                <Spinner />
              </div>
            ) : (
              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[820px]">
                  <div className={clsx(COLS, "border-b border-black/[0.08] px-3 pb-2.5")}>
                    <span className={headCls}>Наименование</span>
                    <span className={headCls}>Категория</span>
                    <span className={headCls}>Остаток</span>
                    <span className={headCls}>Вес</span>
                    <span className={headCls}>Статус</span>
                    <span />
                  </div>

                  {sortedBalances.length === 0 ? (
                    <p className="py-12 text-center text-sm text-muted">Остатков не найдено</p>
                  ) : (
                    sortedBalances.map((row) => {
                      const known = CATEGORY_ORDER.find((c) => norm(c) === norm(row.category));
                      const catColor = known ? CATEGORY_COLOR[known] ?? "#5b8def" : null;
                      const catLabel = known
                        ? CATEGORY_SHORT[known] ?? known
                        : row.category ?? (row.item_type === ItemType.MATERIAL ? "Сырьё" : "—");
                      const weight = weightKgOf(row);
                      const st = STATUS_META[statusOf(row)];
                      return (
                        <div
                          key={row.key}
                          className={clsx(COLS, "w-full rounded-2xl px-3 py-3 transition-colors hover:bg-white/50")}
                        >
                          {isAdmin ? (
                            <button
                              type="button"
                              onClick={() => openCard(row)}
                              title="Открыть карточку"
                              className="truncate text-left text-[13.5px] font-semibold text-text hover:text-primary hover:underline"
                            >
                              {row.name}
                            </button>
                          ) : (
                            <span className="truncate text-[13.5px] font-semibold text-text">{row.name}</span>
                          )}
                          <span className="flex min-w-0 flex-col gap-1">
                            {catColor ? (
                              <span
                                className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                                style={{ color: catColor, background: rgba(catColor, 0.13), borderColor: rgba(catColor, 0.26) }}
                              >
                                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: catColor }} />
                                <span className="truncate">{catLabel}</span>
                              </span>
                            ) : (
                              <span className="self-start rounded-full border border-border bg-white/60 px-2.5 py-1 text-[11.5px] font-semibold text-muted">
                                {catLabel}
                              </span>
                            )}
                            {row.subcategory && (
                              <span className="pl-0.5 text-[11px] text-muted">{row.subcategory}</span>
                            )}
                          </span>
                          <span className="min-w-0">
                            <span className="text-[14px] font-bold text-text">{formatNumber(row.quantity, 0)}</span>
                            <span className="text-[11.5px] text-muted"> {row.unit}</span>
                          </span>
                          <span className={clsx("text-[13px] font-semibold", weight !== null ? "text-info" : "text-muted/60")}>
                            {weight !== null ? formatWeight(weight) : "—"}
                          </span>
                          <span>
                            <span className={clsx("inline-flex rounded-full px-2.5 py-1 text-[11.5px] font-semibold", st.cls)}>
                              {st.label}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => openAdjustFor(row)}
                            title="Приход / расход"
                            className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/70 hover:text-text"
                          >
                            <ChevronRight className="h-4 w-4" strokeWidth={2} />
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* Телефон/планшет (< lg) — карточки остатков + поп-ап */}
            <MobileCardList
              rows={sortedBalances}
              keyField={(row) => row.key}
              isLoading={balances.isLoading}
              emptyMessage="Остатков не найдено"
              renderCard={(row) => {
                const known = CATEGORY_ORDER.find((c) => norm(c) === norm(row.category));
                const catColor = known ? CATEGORY_COLOR[known] ?? "#5b8def" : null;
                const catLabel = known
                  ? CATEGORY_SHORT[known] ?? known
                  : row.category ?? (row.item_type === ItemType.MATERIAL ? "Сырьё" : "—");
                const weight = weightKgOf(row);
                const st = STATUS_META[statusOf(row)];
                return (
                  <button
                    type="button"
                    onClick={() => setSelectedBalance(row)}
                    className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-text">{row.name}</span>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                          style={
                            catColor
                              ? { color: catColor, background: rgba(catColor, 0.13), borderColor: rgba(catColor, 0.26) }
                              : { color: "rgba(40,40,60,0.6)", background: "rgba(255,255,255,0.6)", borderColor: "rgba(40,40,60,0.14)" }
                          }
                        >
                          {catColor && <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor }} />}
                          {catLabel}
                        </span>
                        <span className={clsx("inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold", st.cls)}>
                          {st.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-0.5">
                      <span className="text-[14px] font-bold tabular-nums text-text">
                        {formatNumber(row.quantity, 0)}
                        <span className="text-[11px] font-medium text-muted"> {row.unit}</span>
                      </span>
                      {weight !== null && <span className="text-[11px] font-semibold text-info">{formatWeight(weight)}</span>}
                    </div>
                  </button>
                );
              }}
            />
          </div>
        </>
      ) : movements.isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Десктоп (lg+) — таблица движений */}
          <div className="hidden lg:block">
            <DataTable
              columns={movementColumns}
              rows={movements.data?.items ?? []}
              keyField={(row) => row.id}
              emptyMessage="Движений не найдено"
              footer={movementsFooter}
            />
          </div>

          {/* Телефон/планшет (< lg) — карточки движений + поп-ап */}
          <MobileCardList
            rows={movements.data?.items ?? []}
            keyField={(row) => row.id}
            emptyMessage="Движений не найдено"
            footer={movementsFooter}
            renderCard={(row) => {
              const isIn = row.movement_type.endsWith("_IN");
              return (
                <button
                  type="button"
                  onClick={() => setSelectedMovement(row)}
                  className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <span className="truncate text-[13.5px] font-semibold text-text">{itemName(row)}</span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge
                        label={movementTypeLabels[row.movement_type]}
                        className={isIn ? "bg-success-bg text-green-800" : "bg-danger-bg text-red-800"}
                      />
                      <span className="text-[11px] text-muted">{formatDateTime(row.created_at)}</span>
                    </div>
                  </div>
                  <span
                    className={clsx("shrink-0 text-[14px] font-bold tabular-nums", isIn ? "text-success" : "text-danger")}
                  >
                    {isIn ? "+" : "−"}
                    {formatNumber(row.quantity, 0)} {row.unit}
                  </span>
                </button>
              );
            }}
          />
        </>
      )}

      <Modal open={showAdjust} title="Оформить приход / корректировку" onClose={() => setShowAdjust(false)}>
        <form onSubmit={handleAdjustSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Тип</label>
            <select
              value={form.item_type}
              onChange={(e) =>
                setForm({ ...form, item_type: e.target.value as ItemType, product_id: "", material_id: "", unit: "" })
              }
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
            >
              <option value={ItemType.PRODUCT}>Товар</option>
              <option value={ItemType.MATERIAL}>Материал</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">
              {form.item_type === ItemType.PRODUCT ? "Товар" : "Материал"}
            </label>
            <Combobox
              value={form.item_type === ItemType.PRODUCT ? form.product_id || null : form.material_id || null}
              onChange={(v) => {
                const opts = form.item_type === ItemType.PRODUCT ? productMap : materialMap;
                const picked = v ? opts.get(v) : null;
                setForm({
                  ...form,
                  product_id: form.item_type === ItemType.PRODUCT ? v ?? "" : "",
                  material_id: form.item_type === ItemType.MATERIAL ? v ?? "" : "",
                  unit: picked?.unit ?? form.unit,
                });
              }}
              options={form.item_type === ItemType.PRODUCT ? productOptions : materialOptions}
              placeholder="Выбрать"
              allowClear={false}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">Кол-во</label>
              <input
                type="number"
                min="0"
                step="0.001"
                value={form.quantity}
                onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">Ед. изм.</label>
              <input
                type="text"
                value={form.unit}
                readOnly
                disabled
                placeholder="—"
                title="Единица измерения берётся из карточки товара"
                className="w-full rounded-xl border-[1.5px] border-border bg-black/[0.03] text-muted outline-none px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">Направление</label>
              <select
                value={form.direction}
                onChange={(e) => setForm({ ...form, direction: e.target.value as AdjustmentDirection })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
              >
                <option value={AdjustmentDirection.IN}>Приход (+)</option>
                <option value={AdjustmentDirection.OUT}>Расход (−)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">
              Себестоимость за единицу (необязательно)
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.unit_cost}
              onChange={(e) => setForm({ ...form, unit_cost: e.target.value })}
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Комментарий</label>
            <input
              type="text"
              value={form.comment}
              onChange={(e) => setForm({ ...form, comment: e.target.value })}
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
            />
          </div>

          {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

          <div className="mt-1 flex gap-2">
            <Button type="submit" disabled={createAdjustment.isPending}>
              Провести
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowAdjust(false)}>
              Отмена
            </Button>
          </div>
        </form>
      </Modal>

      {/* Поп-ап по позиции остатка (мобильные карточки) */}
      <DetailModal
        open={!!selectedBalance}
        title={selectedBalance?.name ?? ""}
        onClose={() => setSelectedBalance(null)}
        fields={
          selectedBalance
            ? [
                {
                  label: "Категория",
                  value: (() => {
                    const known = CATEGORY_ORDER.find((c) => norm(c) === norm(selectedBalance.category));
                    return known
                      ? CATEGORY_SHORT[known] ?? known
                      : selectedBalance.category ?? (selectedBalance.item_type === ItemType.MATERIAL ? "Сырьё" : "—");
                  })(),
                },
                ...(selectedBalance.subcategory ? [{ label: "Подкатегория", value: selectedBalance.subcategory }] : []),
                { label: "Остаток", value: `${formatNumber(selectedBalance.quantity, 0)} ${selectedBalance.unit}` },
                {
                  label: "Вес",
                  value: weightKgOf(selectedBalance) !== null ? formatWeight(weightKgOf(selectedBalance)!) : "—",
                },
                { label: "Мин. остаток", value: formatNumber(selectedBalance.min_stock, 0) },
                { label: "Статус", value: STATUS_META[statusOf(selectedBalance)].label },
              ]
            : []
        }
        actions={
          selectedBalance && (
            <>
              <Button
                className="flex-1 justify-center"
                onClick={() => {
                  const r = selectedBalance;
                  setSelectedBalance(null);
                  openAdjustFor(r);
                }}
              >
                <Plus className="h-4 w-4" strokeWidth={2.2} /> Приход / расход
              </Button>
              {isAdmin && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    const r = selectedBalance;
                    setSelectedBalance(null);
                    openCard(r);
                  }}
                >
                  Карточка
                </Button>
              )}
            </>
          )
        }
      />

      {/* Поп-ап по движению склада (мобильные карточки) */}
      <DetailModal
        open={!!selectedMovement}
        title={selectedMovement ? itemName(selectedMovement) : ""}
        onClose={() => setSelectedMovement(null)}
        fields={
          selectedMovement
            ? [
                { label: "Дата", value: formatDateTime(selectedMovement.created_at) },
                { label: "Тип движения", value: movementTypeLabels[selectedMovement.movement_type] },
                { label: "Кол-во", value: `${formatNumber(selectedMovement.quantity, 3)} ${selectedMovement.unit}` },
                { label: "Источник", value: sourceTypeLabels[selectedMovement.source_type] },
                ...(selectedMovement.comment ? [{ label: "Комментарий", value: selectedMovement.comment, full: true }] : []),
              ]
            : []
        }
        actions={
          selectedMovement &&
          isSuperAdmin && (
            <Button
              variant="danger"
              className="flex-1 justify-center"
              onClick={() => {
                const r = selectedMovement;
                setSelectedMovement(null);
                handleDeleteMovement(r);
              }}
            >
              Удалить движение
            </Button>
          )
        }
      />

      <ProductFormModal open={cardProduct !== null} product={cardProduct} onClose={() => setCardProduct(null)} />
      <MaterialFormModal open={cardMaterial !== null} material={cardMaterial} onClose={() => setCardMaterial(null)} />
    </div>
  );
}
