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
