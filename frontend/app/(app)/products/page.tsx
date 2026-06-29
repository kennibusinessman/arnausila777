"use client";

import { clsx } from "clsx";
import {
  AlertTriangle,
  ArrowUpDown,
  Boxes,
  Coins,
  Download,
  LayoutGrid,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DetailModal } from "@/components/ui/DetailModal";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { useAuthStore } from "@/lib/auth/store";
import { useCreateMaterial, useDeleteMaterial, useUpdateMaterial } from "@/lib/hooks/useMaterials";
import { useCatalog, useCreateProduct, useDeleteProduct, useUpdateProduct } from "@/lib/hooks/useProducts";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import type { CatalogItem } from "@/lib/types/product";
import { formatCompactCurrency, formatCurrency, formatNumber } from "@/lib/utils/format";
import { PRODUCT_CATEGORIES, SPUNBOND_SUBCATEGORIES, defaultUnit } from "@/lib/utils/productCategories";

const MATERIAL = "__material__";
const SPUNBOND = "Спанбонд";

type StockStatus = "ok" | "low" | "out";
type SortKey = "name" | "qty" | "price";

const STATUS_META: Record<StockStatus, { label: string; color: string; bg: string; border: string }> = {
  ok: { label: "В наличии", color: "#178a55", bg: "rgba(31,157,99,0.12)", border: "rgba(31,157,99,0.22)" },
  low: { label: "Заканчивается", color: "#c47d1f", bg: "rgba(240,162,60,0.13)", border: "rgba(240,162,60,0.28)" },
  out: { label: "Нет в наличии", color: "#bd4836", bg: "rgba(214,85,63,0.12)", border: "rgba(214,85,63,0.24)" },
};

const SORT_LABEL: Record<SortKey, string> = { name: "По названию", qty: "По количеству", price: "По цене" };

const PRODUCT_PALETTE = [
  { color: "#3f6fd6", bg: "rgba(91,141,239,0.13)", border: "rgba(91,141,239,0.26)", swatch: "linear-gradient(140deg,#5b8def,#7aa6ff)" },
  { color: "#178a55", bg: "rgba(31,157,99,0.12)", border: "rgba(31,157,99,0.24)", swatch: "linear-gradient(140deg,#3fc6c6,#5bd9c4)" },
  { color: "#c47d1f", bg: "rgba(240,162,60,0.13)", border: "rgba(240,162,60,0.28)", swatch: "linear-gradient(140deg,#f0a23c,#f5c06b)" },
];
const MATERIAL_META = { label: "Сырьё", color: "#6d52cc", bg: "rgba(141,107,255,0.13)", border: "rgba(141,107,255,0.26)", swatch: "linear-gradient(140deg,#8d6bff,#b08bff)" };
const NO_CAT_META = { color: "rgba(40,40,60,0.55)", bg: "rgba(40,40,60,0.07)", border: "rgba(40,40,60,0.14)", swatch: "linear-gradient(140deg,#9aa3b2,#c2c9d6)" };

function catMeta(item: CatalogItem) {
  if (item.kind === "material") return MATERIAL_META;
  if (!item.category) return { label: "Без категории", ...NO_CAT_META };
  let h = 0;
  for (let i = 0; i < item.category.length; i++) h = (h * 31 + item.category.charCodeAt(i)) >>> 0;
  return { label: item.category, ...(PRODUCT_PALETTE[h % PRODUCT_PALETTE.length] ?? PRODUCT_PALETTE[0]!) };
}

function stockStatus(qty: number, min: number): StockStatus {
  if (qty <= 0) return "out";
  if (min > 0 && qty <= min) return "low";
  return "ok";
}

function qtyLabel(q: number): string {
  return Number.isInteger(q) ? q.toLocaleString("ru-RU") : q.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export default function ProductsPage() {
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;
  const isSuperAdmin = role === UserRole.SUPER_ADMIN;

  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("all"); // all | product | material | cat:<name>
  const [stock, setStock] = useState<"all" | "low" | "out">("all");
  const [sort, setSort] = useState<SortKey>("name");
  const [editing, setEditing] = useState<CatalogItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  const { data: items, isLoading } = useCatalog();
  const deleteProduct = useDeleteProduct();
  const deleteMaterial = useDeleteMaterial();

  const all = items ?? [];

  const productCats = useMemo(() => {
    const set = new Set<string>();
    for (const it of all) if (it.kind === "product" && it.category) set.add(it.category);
    const ordered = PRODUCT_CATEGORIES.filter((c) => set.has(c)) as string[];
    for (const c of set) if (!ordered.includes(c)) ordered.push(c);
    return ordered;
  }, [all]);

  const catTabs = [
    { id: "all", label: "Все" },
    { id: "product", label: "Продукция" },
    ...productCats.map((c) => ({ id: `cat:${c}`, label: c })),
    { id: "material", label: "Сырьё" },
  ];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = all.filter((it) => {
      if (cat === "product" && it.kind !== "product") return false;
      if (cat === "material" && it.kind !== "material") return false;
      if (cat.startsWith("cat:") && !(it.kind === "product" && it.category === cat.slice(4))) return false;
      const st = stockStatus(Number(it.quantity), Number(it.min_stock));
      if (stock === "low" && st !== "low") return false;
      if (stock === "out" && st !== "out") return false;
      if (q && !`${it.name} ${it.sku ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "qty") return Number(b.quantity) - Number(a.quantity);
      if (sort === "price") return Number(b.price) - Number(a.price);
      return a.name.localeCompare(b.name, "ru");
    });
  }, [all, cat, stock, search, sort]);

  const lowCount = all.filter((it) => stockStatus(Number(it.quantity), Number(it.min_stock)) !== "ok").length;
  const totalUnits = all.reduce((s, it) => s + Number(it.quantity), 0);
  const totalValue = all.reduce((s, it) => s + Number(it.quantity) * Number(it.price), 0);

  const kpis = [
    { label: "Позиций в каталоге", value: String(all.length), valueColor: "#1c1c22", icon: LayoutGrid, iconColor: "#3b82f6", iconBg: "rgba(59,130,246,0.14)" },
    { label: "Всего единиц", value: formatNumber(totalUnits, 0), valueColor: "#1c1c22", icon: Boxes, iconColor: "#8b5cf6", iconBg: "rgba(139,92,246,0.14)" },
    { label: "Требует пополнения", value: String(lowCount), valueColor: lowCount ? "#c47d1f" : "#1c1c22", icon: AlertTriangle, iconColor: "#f0a23c", iconBg: "rgba(240,162,60,0.14)" },
    { label: "Стоимость склада", value: formatCompactCurrency(totalValue), valueColor: "#178a55", icon: Coins, iconColor: "#1f9d63", iconBg: "rgba(31,157,99,0.14)" },
  ];

  const hasFilter = !!(search || cat !== "all" || stock !== "all");
  const gridCols = "minmax(0,1.6fr) 160px 70px 120px 132px 130px 84px";

  function openCreate() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(item: CatalogItem) {
    setEditing(item);
    setShowForm(true);
  }
  function handleDelete(item: CatalogItem) {
    const noun = item.kind === "material" ? "сырьё" : "товар";
    if (!window.confirm(`Удалить ${noun} «${item.name}»? Действие необратимо.`)) return;
    const mut = item.kind === "material" ? deleteMaterial : deleteProduct;
    mut.mutate(item.id, {
      onError: (err) => window.alert(apiErrorMessage(err, "Не удалось удалить позицию")),
    });
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* ===== FILTER BAR ===== */}
      <div className="glass flex flex-wrap items-center gap-3 rounded-2xl p-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2">
          <Search className="h-[15px] w-[15px] text-muted" strokeWidth={2} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по названию или артикулу…"
            className="w-full border-none bg-transparent text-[13px] text-text outline-none placeholder:text-muted"
          />
        </div>

        <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          {catTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setCat(t.id)}
              className={clsx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                cat === t.id
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex gap-1 rounded-xl border border-white/70 bg-white/55 p-1">
          {([["all", "Все остатки"], ["low", "Заканчивается"], ["out", "Нет в наличии"]] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setStock(id)}
              className={clsx(
                "whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] transition-colors",
                stock === id
                  ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.12)]"
                  : "font-medium text-muted hover:text-text"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {hasFilter && (
          <button
            onClick={() => {
              setSearch("");
              setCat("all");
              setStock("all");
            }}
            className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger-bg"
          >
            <X className="h-[14px] w-[14px]" strokeWidth={2.2} /> Сбросить
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={() => setSort((s) => (s === "name" ? "qty" : s === "qty" ? "price" : "name"))}
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
          <h3 className="text-[16px] font-bold tracking-tight text-text">Номенклатура</h3>
          <span className="rounded-full border border-white/70 bg-white/55 px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
            {filtered.length} из {all.length}
          </span>
          <div className="flex-1" />
          <button disabled title="Скоро" className="hidden items-center gap-2 rounded-xl border border-white/70 bg-white/60 px-3.5 py-2 text-[12.5px] font-medium text-muted opacity-60 sm:flex">
            <Download className="h-[15px] w-[15px]" strokeWidth={1.9} /> Экспорт
          </button>
          {isAdmin && (
            <Button onClick={openCreate} className="!px-4 !py-2 !text-[12.5px]">
              <Plus className="h-[15px] w-[15px]" strokeWidth={2.3} /> Добавить позицию
            </Button>
          )}
        </div>

        {/* Десктоп (lg+) — таблица с горизонтальным скроллом */}
        <div className="hidden min-h-0 flex-1 overflow-x-auto lg:block">
          <div className="flex h-full min-w-[880px] flex-col lg:min-w-0">
        {/* column header */}
        <div className="grid gap-3 border-b border-border px-3 pb-2.5" style={{ gridTemplateColumns: gridCols }}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Товар</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Категория</span>
          <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Ед.</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Количество</span>
          <span className="text-right text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">Цена</span>
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
              <Package className="h-11 w-11 opacity-40" strokeWidth={1.5} />
              <div className="text-[14px] font-semibold text-text/70">Позиции не найдены</div>
              <div className="text-[12.5px]">Измените фильтры или добавьте новую позицию</div>
            </div>
          ) : (
            filtered.map((it) => {
              const cm = catMeta(it);
              const qty = Number(it.quantity);
              const st = stockStatus(qty, Number(it.min_stock));
              const sm = STATUS_META[st];
              const qtyColor = st === "out" ? "#bd4836" : st === "low" ? "#c47d1f" : "#22222e";
              return (
                <div
                  key={`${it.kind}-${it.id}`}
                  className={clsx(
                    "grid items-center gap-3 rounded-2xl px-3 py-2.5 transition-colors hover:bg-white/50",
                    !it.is_active && "opacity-55"
                  )}
                  style={{ gridTemplateColumns: gridCols }}
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div
                      className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border-2 border-white/70 text-white shadow-[0_4px_10px_rgba(40,50,90,0.12)]"
                      style={{ background: cm.swatch }}
                    >
                      <Package className="h-[18px] w-[18px]" strokeWidth={1.9} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[13.5px] font-semibold text-text">{it.name}</span>
                        {!it.is_active && (
                          <span className="shrink-0 rounded border border-border px-1.5 py-px text-[10px] font-medium text-muted">
                            Скрыт
                          </span>
                        )}
                      </div>
                      <div className="truncate text-[11.5px] text-muted">{it.sku ? `Арт. ${it.sku}` : "—"}</div>
                    </div>
                  </div>
                  <span
                    className="inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: cm.bg, color: cm.color, borderColor: cm.border }}
                  >
                    {cm.label}
                  </span>
                  <span className="text-[13px] text-text/60">{it.unit}</span>
                  <span className="text-right text-[14px] font-bold tabular-nums" style={{ color: qtyColor }}>
                    {qtyLabel(qty)}
                  </span>
                  <span className="text-right text-[14px] font-bold tabular-nums text-text">
                    {it.kind === "material" ? "—" : formatCurrency(it.price)}
                  </span>
                  <span
                    className="inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}
                  >
                    {sm.label}
                  </span>
                  <div className="flex items-center justify-end gap-1">
                    {isAdmin && (
                      <button
                        onClick={() => openEdit(it)}
                        title="Изменить"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-white/70 hover:text-text"
                      >
                        <Pencil className="h-[15px] w-[15px]" strokeWidth={1.9} />
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        onClick={() => handleDelete(it)}
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
          keyField={(it) => `${it.kind}-${it.id}`}
          isLoading={isLoading}
          emptyMessage="Позиции не найдены"
          renderCard={(it) => {
            const cm = catMeta(it);
            const qty = Number(it.quantity);
            const st = stockStatus(qty, Number(it.min_stock));
            const sm = STATUS_META[st];
            return (
              <button
                type="button"
                onClick={() => setSelected(it)}
                className={clsx(
                  "glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]",
                  !it.is_active && "opacity-55"
                )}
              >
                <div
                  className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border-2 border-white/70 text-white shadow-[0_4px_10px_rgba(40,50,90,0.12)]"
                  style={{ background: cm.swatch }}
                >
                  <Package className="h-[18px] w-[18px]" strokeWidth={1.9} />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-[13.5px] font-semibold text-text">{it.name}</span>
                  <span className="truncate text-xs text-muted">
                    {cm.label} · {it.unit}
                  </span>
                  <span
                    className="inline-flex w-fit items-center rounded-full border px-2 py-0.5 text-[10.5px] font-semibold"
                    style={{ background: sm.bg, color: sm.color, borderColor: sm.border }}
                  >
                    {sm.label}
                  </span>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-0.5">
                  <span className="text-[14px] font-bold tabular-nums text-text">{qtyLabel(qty)}</span>
                  {it.kind !== "material" && (
                    <span className="text-[11px] text-muted">{formatCurrency(it.price)}</span>
                  )}
                </div>
              </button>
            );
          }}
        />
      </div>

      <DetailModal
        open={!!selected}
        title={selected?.name ?? ""}
        onClose={() => setSelected(null)}
        fields={
          selected
            ? [
                { label: "Категория", value: catMeta(selected).label },
                ...(selected.subcategory ? [{ label: "Подкатегория", value: selected.subcategory }] : []),
                { label: "Артикул", value: selected.sku ? selected.sku : "—" },
                { label: "Ед. изм.", value: selected.unit },
                { label: "Количество", value: `${qtyLabel(Number(selected.quantity))} ${selected.unit}` },
                ...(selected.kind === "material"
                  ? []
                  : [{ label: "Цена", value: formatCurrency(selected.price) }]),
                { label: "Мин. остаток", value: qtyLabel(Number(selected.min_stock)) },
                { label: "Статус", value: STATUS_META[stockStatus(Number(selected.quantity), Number(selected.min_stock))].label },
              ]
            : []
        }
        actions={
          selected && (
            <>
              {isAdmin && (
                <Button
                  className="flex-1 justify-center"
                  onClick={() => {
                    const it = selected;
                    setSelected(null);
                    openEdit(it);
                  }}
                >
                  <Pencil className="h-4 w-4" strokeWidth={1.9} /> Изменить
                </Button>
              )}
              {isSuperAdmin && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const it = selected;
                    setSelected(null);
                    handleDelete(it);
                  }}
                >
                  <Trash2 className="h-4 w-4" strokeWidth={1.9} /> Удалить
                </Button>
              )}
            </>
          )
        }
      />

      {showForm && <CatalogItemModal item={editing} onClose={() => setShowForm(false)} />}
    </div>
  );
}

const inputCls =
  "w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2 text-sm outline-none focus:border-primary/50";

interface FormState {
  category: string; // "" | <product cat> | MATERIAL
  name: string;
  sku: string;
  subcategory: string;
  unit: string;
  price: string;
  base_weight: string;
  min_stock: string;
  is_active: boolean;
}

function CatalogItemModal({ item, onClose }: { item: CatalogItem | null; onClose: () => void }) {
  const isEdit = !!item;
  const [form, setForm] = useState<FormState>(() =>
    item
      ? {
          category: item.kind === "material" ? MATERIAL : item.category ?? "",
          name: item.name,
          sku: item.sku ?? "",
          subcategory: item.subcategory ?? "",
          unit: item.unit,
          price: item.price,
          base_weight: item.base_weight ?? "",
          min_stock: item.min_stock,
          is_active: item.is_active,
        }
      : { category: "", name: "", sku: "", subcategory: "", unit: "шт", price: "0", base_weight: "", min_stock: "0", is_active: true }
  );
  const [error, setError] = useState<string | null>(null);

  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const createMaterial = useCreateMaterial();
  const updateMaterial = useUpdateMaterial();
  const submitting = createProduct.isPending || updateProduct.isPending || createMaterial.isPending || updateMaterial.isPending;

  const isMaterial = form.category === MATERIAL;
  const requiresSub = form.category === SPUNBOND;
  const requiresWeight = form.category === SPUNBOND || form.category === "Одноразовые простыни";

  // Дефолт единицы следует за типом позиции: сырьё и полуфабрикат-спанбонд — «кг»,
  // готовая продукция — «шт». При создании не затираем единицу, введённую вручную;
  // при редактировании единицу из карточки не трогаем.
  useEffect(() => {
    if (isEdit) return;
    const auto = defaultUnit({ isMaterial, subcategory: requiresSub ? form.subcategory : null });
    setForm((f) => (f.unit === "" || f.unit === "шт" || f.unit === "кг" ? { ...f, unit: auto } : f));
  }, [isEdit, isMaterial, requiresSub, form.subcategory]);

  const catOptions: { value: string; label: string; dot: string }[] = [
    { value: "", label: "Без категории", dot: "#9aa3b2" },
    ...PRODUCT_CATEGORIES.map((c, i) => ({ value: c, label: c, dot: (PRODUCT_PALETTE[i % PRODUCT_PALETTE.length] ?? PRODUCT_PALETTE[0]!).color })),
    { value: MATERIAL, label: "Сырьё", dot: "#8d6bff" },
  ];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.unit.trim()) {
      setError("Укажите название и единицу измерения");
      return;
    }
    if (!isMaterial && requiresSub && !form.subcategory) {
      setError("Для категории «Спанбонд» обязательна подкатегория");
      return;
    }
    if (!isMaterial && requiresWeight && (!form.base_weight || Number(form.base_weight) <= 0)) {
      setError(`Для категории «${form.category}» обязателен вес единицы, кг`);
      return;
    }

    let mutation: Promise<unknown>;
    if (isMaterial) {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        unit: form.unit,
        min_stock: form.min_stock || "0",
        is_active: form.is_active,
      };
      mutation =
        item && item.kind === "material"
          ? updateMaterial.mutateAsync({ id: item.id, data: payload })
          : createMaterial.mutateAsync(payload);
    } else {
      const payload = {
        name: form.name,
        sku: form.sku || null,
        category: form.category || null,
        subcategory: requiresSub ? form.subcategory || null : null,
        unit: form.unit,
        default_price: form.price || "0",
        base_weight: form.base_weight || null,
        min_stock: form.min_stock || "0",
        is_active: form.is_active,
      };
      mutation =
        item && item.kind === "product"
          ? updateProduct.mutateAsync({ id: item.id, data: payload })
          : createProduct.mutateAsync(payload);
    }
    mutation.then(onClose).catch((err) => setError(apiErrorMessage(err, "Не удалось сохранить позицию")));
  }

  const title = isEdit ? (isMaterial ? "Редактировать сырьё" : "Редактировать товар") : "Новая позиция";

  return (
    <Modal open title={title} size="lg" onClose={onClose}>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-3.5">
        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-muted">Наименование</label>
          <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Напр. Профиль алюминиевый 40×40" className={inputCls} />
        </div>

        <div className="col-span-2 flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-muted">Категория</label>
          <div className="flex flex-wrap gap-2">
            {catOptions.map((c) => {
              const active = form.category === c.value;
              // Нельзя превращать товар в сырьё и наоборот при редактировании.
              const disabled = isEdit && ((item!.kind === "material") !== (c.value === MATERIAL));
              return (
                <button
                  key={c.value || "none"}
                  type="button"
                  disabled={disabled}
                  onClick={() => set("category", c.value)}
                  className={clsx(
                    "inline-flex items-center gap-2 rounded-xl border px-3.5 py-2 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                    active ? "bg-white/95 font-semibold text-text shadow-[0_3px_9px_rgba(40,50,90,0.1)]" : "bg-white/50 font-medium text-muted hover:bg-white/70"
                  )}
                  style={{ borderColor: active ? "rgba(91,141,239,0.5)" : "rgba(255,255,255,0.7)" }}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: c.dot }} />
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {requiresSub && (
          <div className="col-span-2 flex flex-col gap-1.5">
            <label className="text-[12px] font-semibold text-muted">Подкатегория</label>
            <select value={form.subcategory} onChange={(e) => set("subcategory", e.target.value)} className={inputCls}>
              <option value="">Выберите подкатегорию</option>
              {SPUNBOND_SUBCATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-muted">Артикул</label>
          <input value={form.sku} onChange={(e) => set("sku", e.target.value)} placeholder="Авто, если пусто" className={inputCls} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-muted">Единица измерения</label>
          <input value={form.unit} onChange={(e) => set("unit", e.target.value)} placeholder="шт, м, кг, рул…" className={inputCls} />
        </div>

        {!isMaterial && (
          <>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-muted">Цена за единицу, ₸</label>
              <input value={form.price} onChange={(e) => set("price", e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={clsx(inputCls, "font-semibold")} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-[12px] font-semibold text-muted">
                Вес ед., кг{requiresWeight && <span className="text-danger"> *</span>}
              </label>
              <input value={form.base_weight} onChange={(e) => set("base_weight", e.target.value.replace(/[^\d.]/g, ""))} placeholder={requiresWeight ? "обязательно" : "необязательно"} inputMode="decimal" className={inputCls} />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <label className="text-[12px] font-semibold text-muted">Мин. остаток</label>
          <input value={form.min_stock} onChange={(e) => set("min_stock", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0 — без контроля" inputMode="decimal" className={clsx(inputCls, "font-semibold")} />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-[13px] font-medium text-text">
          <input type="checkbox" checked={form.is_active} onChange={(e) => set("is_active", e.target.checked)} />
          Активна
        </label>

        <p className="col-span-2 text-[11.5px] text-muted">
          Количество меняется на странице «Остатки» — складскими движениями, а не вручную здесь.
        </p>

        {error && <p className="col-span-2 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="col-span-2 mt-1 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose} disabled={submitting}>
            Отмена
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Сохранение…" : isEdit ? "Сохранить" : "Добавить"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
