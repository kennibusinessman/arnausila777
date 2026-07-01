import type { OrderItemRead } from "@/lib/types/order";

/**
 * Экономика заказа по сырью (полипропилен).
 *
 * Правило: 1 кг сырья = 1 кг готовой продукции, значит расход сырья в кг равен
 * весу заказа, а себестоимость = вес × цена сырья за кг. Чистая прибыль —
 * выручка (сумма заказа) минус себестоимость. Цена сырья задаётся в настройках
 * (Настройки → Экономика), поэтому передаётся аргументом.
 */

/** Значение по умолчанию, пока не загрузились настройки (совпадает с сервером). */
export const DEFAULT_RAW_PRICE_PER_KG = 750;

/** Суммарный вес позиций в кг (для OrderRead, где нет готового total_weight). */
export function orderItemsWeight(items: OrderItemRead[]): number {
  return items.reduce((sum, it) => {
    const bw = Number(it.product?.base_weight ?? 0);
    return sum + (Number(it.quantity) || 0) * (bw || 0);
  }, 0);
}

export interface OrderEconomics {
  /** Вес заказа = расход сырья, кг. */
  weightKg: number;
  /** Выручка (сумма заказа), ₸. */
  revenue: number;
  /** Себестоимость сырья, ₸. */
  rawCost: number;
  /** Чистая прибыль = выручка − себестоимость, ₸. */
  netProfit: number;
  /** Рентабельность = чистая прибыль ÷ выручка × 100, %. null при нулевой выручке. */
  profitability: number | null;
}

export function orderEconomics(
  revenue: number,
  weightKg: number,
  rawPricePerKg: number
): OrderEconomics {
  const rawCost = weightKg * rawPricePerKg;
  const netProfit = revenue - rawCost;
  const profitability = revenue > 0 ? (netProfit / revenue) * 100 : null;
  return { weightKg, revenue, rawCost, netProfit, profitability };
}
