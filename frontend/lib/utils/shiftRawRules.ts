/**
 * Правила «какая продукция из какого сырья делается». Сырьё в сменном отчёте не
 * выбирается вручную, а подставляется по категории выпускаемой продукции:
 *
 *  - Спанбонд            → сырьё Полипропилен (материал со склада сырья);
 *  - Одноразовые простыни → сырьё Спанбонд — ЛЮБОЙ товар категории «Спанбонд»;
 *  - Дастархан           → сырьё «Сырьё Дастархан» (материал со склада сырья) по
 *                          умолчанию + при необходимости ЛЮБОЙ товар «Спанбонд».
 *
 * Для простыней/дастархана в выпадающем списке доступен весь спанбонд (любая
 * подкатегория). У Дастархана в тот же слот подмешиваются материалы «Сырьё Дастархан»
 * (alsoMaterials) — они идут первыми и выбираются по умолчанию; каждый вариант несёт
 * свой kind (material/product), поэтому в один отчёт можно записать и материал, и
 * спанбонд. Подкатегория из defaultSubcategory подставляется только при создании
 * сырья-товара «на ходу» — сам список подкатегорий не меняется.
 *
 * Строковые константы должны совпадать с category/subcategory в справочнике товаров
 * (см. backend/app/models/product.py) и подкатегориями сырья (productCategories.ts).
 */
import type { MaterialRead } from "@/lib/types/material";
import type { ProductRead } from "@/lib/types/product";
import { rawSubcategoryOf } from "@/lib/utils/productCategories";

export const PRODUCT_CATEGORY = {
  SPUNBOND: "Спанбонд",
  SHEETS: "Одноразовые простыни",
  DASTARKHAN: "Дастархан",
} as const;

export const SPUNBOND_SUBCATEGORY = {
  SPUNBOND: "Спанбонд",
  BOBBINS: "Бабины",
  DASTARKHAN_RAW: "Дастархан сырье",
} as const;

export const POLYPROPYLENE = "Полипропилен";

/** Подкатегория сырья-материала для Дастархана (см. RAW_MATERIAL_SUBCATEGORIES в
 *  productCategories.ts) — «родное» сырьё, которое подставляется по умолчанию. */
export const DASTARKHAN_RAW_MATERIAL = "Сырьё Дастархан";

/** Порядок и состав слотов сырья. */
const ORDER = [
  PRODUCT_CATEGORY.SPUNBOND,
  PRODUCT_CATEGORY.SHEETS,
  PRODUCT_CATEGORY.DASTARKHAN,
] as const;

const norm = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

export type RawKind = "material" | "product";

interface RawRule {
  title: string;
  kind: RawKind;
  /** Подставляется при создании нового сырья-товара «на ходу». */
  defaultCategory?: string;
  defaultSubcategory?: string;
  /** Разрешить несколько строк сырья (кнопка «Добавить сырьё»). */
  multi?: boolean;
  matches: (item: ProductRead | MaterialRead) => boolean;
  /** Подмешать в тот же слот материалы со склада сырья (напр. «Сырьё Дастархан»),
   *  помимо основного пула. Такие варианты помечаются kind="material". */
  alsoMaterials?: (m: MaterialRead) => boolean;
}

const RULES: Record<string, RawRule> = {
  [PRODUCT_CATEGORY.SPUNBOND]: {
    title: POLYPROPYLENE,
    kind: "material",
    matches: (m) => norm(m.name).includes(norm(POLYPROPYLENE)),
  },
  [PRODUCT_CATEGORY.SHEETS]: {
    title: PRODUCT_CATEGORY.SPUNBOND,
    kind: "product",
    defaultCategory: PRODUCT_CATEGORY.SPUNBOND,
    defaultSubcategory: SPUNBOND_SUBCATEGORY.BOBBINS,
    // Простыни делают из любого спанбонда — подкатегорию не фильтруем, и можно
    // указать несколько видов спанбонда (кнопка «Добавить сырьё»).
    multi: true,
    matches: (p) => norm((p as ProductRead).category) === norm(PRODUCT_CATEGORY.SPUNBOND),
  },
  [PRODUCT_CATEGORY.DASTARKHAN]: {
    title: `${DASTARKHAN_RAW_MATERIAL} · спанбонд`,
    kind: "product",
    defaultCategory: PRODUCT_CATEGORY.SPUNBOND,
    defaultSubcategory: SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW,
    // Дастархан делают из «Сырья Дастархан» (материал со склада сырья) — оно и
    // подставляется по умолчанию; но допускается и любой спанбонд (иногда крутят из
    // него). Можно указать несколько строк — и материал, и спанбонд в одном отчёте.
    multi: true,
    matches: (p) => norm((p as ProductRead).category) === norm(PRODUCT_CATEGORY.SPUNBOND),
    alsoMaterials: (m) => rawSubcategoryOf(m) === DASTARKHAN_RAW_MATERIAL,
  },
};

export interface RawOption {
  value: string;
  label: string;
  sublabel?: string;
  /** Тип ссылки для этого варианта: материал (сырьё со склада) или товар-полуфабрикат.
   *  В смешанном слоте (Дастархан) варианты бывают обоих типов — см. buildMaterials. */
  kind: RawKind;
}

export interface RawSlot {
  /** Категория выпускаемой продукции — стабильный ключ слота. */
  category: string;
  title: string;
  kind: RawKind;
  defaultCategory?: string;
  defaultSubcategory?: string;
  /** Можно добавлять несколько строк сырья в этот слот. */
  multi?: boolean;
  options: RawOption[];
}

/** Нормализованная категория товара (или null, если она вне известных трёх). */
export function categoryOfProduct(productId: string, products: ProductRead[]): string | null {
  const p = products.find((x) => x.id === productId);
  if (!p?.category) return null;
  return ORDER.find((c) => norm(c) === norm(p.category)) ?? null;
}

/** Слоты сырья для явно заданных категорий выпуска (в каноничном порядке). */
export function rawSlotsForCategories(
  categories: string[],
  products: ProductRead[],
  materials: MaterialRead[]
): RawSlot[] {
  const wanted = new Set(categories.map(norm));
  const slots: RawSlot[] = [];
  for (const category of ORDER) {
    if (!wanted.has(norm(category))) continue;
    const rule = RULES[category];
    if (!rule) continue;
    const pool: (ProductRead | MaterialRead)[] = rule.kind === "material" ? materials : products;
    const options: RawOption[] = pool.filter(rule.matches).map((item) => ({
      value: item.id,
      label: item.name,
      sublabel: item.unit,
      kind: rule.kind,
    }));
    // Материалы со склада сырья («Сырьё Дастархан») — впереди, чтобы «родное» сырьё
    // было выбором по умолчанию (slot.options[0]), а спанбонд — запасным вариантом.
    if (rule.alsoMaterials) {
      const extra: RawOption[] = materials.filter(rule.alsoMaterials).map((m) => ({
        value: m.id,
        label: m.name,
        sublabel: m.unit,
        kind: "material" as RawKind,
      }));
      options.unshift(...extra);
    }
    slots.push({
      category,
      title: rule.title,
      kind: rule.kind,
      defaultCategory: rule.defaultCategory,
      defaultSubcategory: rule.defaultSubcategory,
      multi: rule.multi,
      options,
    });
  }
  return slots;
}

/** Слоты сырья по набору выпускаемой продукции (категории берутся из товаров). */
export function deriveRawSlots(
  outputProductIds: string[],
  products: ProductRead[],
  materials: MaterialRead[]
): RawSlot[] {
  const cats: string[] = [];
  for (const id of outputProductIds) {
    const c = categoryOfProduct(id, products);
    if (c) cats.push(c);
  }
  return rawSlotsForCategories(cats, products, materials);
}

/** Цвет-метка категории — для точек/чипов в таблице (см. zakk/otcet.html). */
export const CATEGORY_COLOR: Record<string, string> = {
  [PRODUCT_CATEGORY.SPUNBOND]: "#5b8def",
  [PRODUCT_CATEGORY.SHEETS]: "#0ea5b7",
  [PRODUCT_CATEGORY.DASTARKHAN]: "#8d6bff",
};

/** Короткая подпись категории для чипов. */
export const CATEGORY_SHORT: Record<string, string> = {
  [PRODUCT_CATEGORY.SPUNBOND]: "Спанбонд",
  [PRODUCT_CATEGORY.SHEETS]: "Простыни",
  [PRODUCT_CATEGORY.DASTARKHAN]: "Дастархан",
};

export const CATEGORY_ORDER: readonly string[] = ORDER;
