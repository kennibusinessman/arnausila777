/**
 * Фиксированный список категорий товара. Хранится как обычная строка в Product.category —
 * это просто curated-список вариантов в выпадающем списке, без отдельной таблицы на backend.
 */
export const PRODUCT_CATEGORIES = ["Спанбонд", "Одноразовые простыни", "Дастархан"] as const;

/**
 * Подкатегории внутри category="Спанбонд" — разные формы выпуска одной линии
 * (хранятся в Product.subcategory). Для остальных категорий подкатегория не используется.
 */
export const SPUNBOND_SUBCATEGORIES = ["Спанбонд", "Бабины", "Дастархан сырье"] as const;

/**
 * Псевдо-категория для раздела «Сырьё» на складе. Это не значение Product.category,
 * а фильтр по item_type === MATERIAL (всё сырьё в едином разделе).
 */
export const RAW_MATERIAL_CATEGORY = "Сырьё";

/**
 * Подкатегории сырья. Хранятся в Material.category (у материалов нет отдельного
 * поля subcategory). Используются для фильтра внутри раздела «Сырьё».
 */
export const RAW_MATERIAL_SUBCATEGORIES = ["Сырьё ПП", "Сырьё Дастархан"] as const;

/**
 * К какой подкатегории сырья отнести материал: сначала по полю category,
 * затем фолбэк по названию (полипропилен → ПП, дастархан → Дастархан).
 */
export function rawSubcategoryOf(material: { name: string; category: string | null }): string | null {
  const cat = (material.category ?? "").trim().toLowerCase();
  if (cat === "сырьё пп" || cat === "сырье пп") return "Сырьё ПП";
  if (cat === "сырьё дастархан" || cat === "сырье дастархан") return "Сырьё Дастархан";
  const name = (material.name ?? "").toLowerCase();
  if (name.includes("полипропилен")) return "Сырьё ПП";
  if (name.includes("дастархан")) return "Сырьё Дастархан";
  return null;
}

/**
 * Полуфабрикат-спанбонд, который меряется в килограммах, а не в штуках
 * (идёт в простыни и дастархан — см. lib/utils/shiftRawRules.ts).
 */
export const KG_SUBCATEGORIES: readonly string[] = ["Бабины", "Дастархан сырье"];

/**
 * Единица измерения по умолчанию. Правило: готовая продукция — «шт»,
 * сырьё и полуфабрикат-спанбонд (Бабины/Дастархан сырьё) — «кг».
 * Только дефолт для форм создания — пользователь может переопределить вручную.
 */
export function defaultUnit(opts: { isMaterial?: boolean; subcategory?: string | null }): string {
  if (opts.isMaterial) return "кг";
  if (opts.subcategory && KG_SUBCATEGORIES.includes(opts.subcategory)) return "кг";
  return "шт";
}
