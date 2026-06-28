/**
 * Правила «какая продукция из какого сырья делается». Сырьё в сменном отчёте не
 * выбирается вручную, а подставляется по категории выпускаемой продукции:
 *
 *  - Спанбонд            → сырьё Полипропилен (материал со склада сырья);
 *  - Одноразовые простыни → сырьё Спанбонд, подкатегория «Бабины» (товар-полуфабрикат);
 *  - Дастархан           → сырьё Спанбонд, подкатегория «Дастархан сырьё» (товар-полуфабрикат).
 *
 * Строковые константы должны совпадать с category/subcategory в справочнике товаров
 * (см. backend/app/models/product.py).
 */
import type { MaterialRead } from "@/lib/types/material";
import type { ProductRead } from "@/lib/types/product";

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
  matches: (item: ProductRead | MaterialRead) => boolean;
}

const RULES: Record<string, RawRule> = {
  [PRODUCT_CATEGORY.SPUNBOND]: {
    title: POLYPROPYLENE,
    kind: "material",
    matches: (m) => norm(m.name).includes(norm(POLYPROPYLENE)),
  },
  [PRODUCT_CATEGORY.SHEETS]: {
    title: `${PRODUCT_CATEGORY.SPUNBOND} · ${SPUNBOND_SUBCATEGORY.BOBBINS}`,
    kind: "product",
    defaultCategory: PRODUCT_CATEGORY.SPUNBOND,
    defaultSubcategory: SPUNBOND_SUBCATEGORY.BOBBINS,
    matches: (p) =>
      norm((p as ProductRead).category) === norm(PRODUCT_CATEGORY.SPUNBOND) &&
      norm((p as ProductRead).subcategory) === norm(SPUNBOND_SUBCATEGORY.BOBBINS),
  },
  [PRODUCT_CATEGORY.DASTARKHAN]: {
    title: `${PRODUCT_CATEGORY.SPUNBOND} · ${SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW}`,
    kind: "product",
    defaultCategory: PRODUCT_CATEGORY.SPUNBOND,
    defaultSubcategory: SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW,
    matches: (p) =>
      norm((p as ProductRead).category) === norm(PRODUCT_CATEGORY.SPUNBOND) &&
      norm((p as ProductRead).subcategory) === norm(SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW),
  },
};

export interface RawOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface RawSlot {
  /** Категория выпускаемой продукции — стабильный ключ слота. */
  category: string;
  title: string;
  kind: RawKind;
  defaultCategory?: string;
  defaultSubcategory?: string;
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
    slots.push({
      category,
      title: rule.title,
      kind: rule.kind,
      defaultCategory: rule.defaultCategory,
      defaultSubcategory: rule.defaultSubcategory,
      options: pool.filter(rule.matches).map((item) => ({
        value: item.id,
        label: item.name,
        sublabel: item.unit,
      })),
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

/** К какому слоту относится уже сохранённая строка сырья (для режима правки). */
export function categoryOfRawLine(
  line: { material_id?: string | null; product_id?: string | null },
  products: ProductRead[]
): string | null {
  if (line.material_id) return PRODUCT_CATEGORY.SPUNBOND;
  if (line.product_id) {
    const p = products.find((x) => x.id === line.product_id);
    if (norm(p?.subcategory) === norm(SPUNBOND_SUBCATEGORY.BOBBINS)) return PRODUCT_CATEGORY.SHEETS;
    if (norm(p?.subcategory) === norm(SPUNBOND_SUBCATEGORY.DASTARKHAN_RAW))
      return PRODUCT_CATEGORY.DASTARKHAN;
  }
  return null;
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
