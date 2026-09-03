import type { OutputRead, ShiftMaterialRead } from "@/lib/types/shiftReport";

/** Что нужно для расчёта — есть и у ShiftReportRead, и у ShiftReportListItem. */
export interface ShiftMetricsInput {
  outputs: OutputRead[];
  materials: ShiftMaterialRead[];
}

const isKg = (u?: string | null) => (u ?? "").trim().toLowerCase() === "кг";

/** Товар в том виде, в каком нужен для веса: единица + вес единицы. */
export interface WeighedItem {
  unit?: string | null;
  base_weight?: string | number | null;
}

/**
 * Вес количества в кг: quantity × base_weight, а если товар и так меряется в «кг» —
 * само количество. 0 — если веса нет и единица не килограммы (штуки без веса
 * единицы в тоннаж не попадают). Единое правило для смен, производства и отчётов.
 */
export function weightKg(quantity: string | number, item?: WeighedItem | null): number {
  const q = Number(quantity) || 0;
  const bw = Number(item?.base_weight ?? 0);
  if (bw > 0) return q * bw;
  if (isKg(item?.unit)) return q;
  return 0;
}

/** Вес позиции выпуска в кг: quantity × base_weight (а если ед. уже «кг» — просто quantity). */
function toKg(quantity: string, product?: OutputRead["product"]): number {
  return weightKg(quantity, product);
}

/**
 * Вес израсходованного сырья в кг.
 * Обычное сырьё (Полипропилен) уже указано в кг → quantity_used.
 * Полуфабрикат-бабины считаются в штуках → количество × вес бабины (base_weight).
 */
function materialKg(m: ShiftMaterialRead): number {
  const q = Number(m.quantity_used) || 0;
  const bw = Number(m.product?.base_weight ?? 0);
  if (bw > 0) return q * bw;
  return q;
}

export interface ShiftMetrics {
  /** Σ количества выпуска (штук/рулонов). */
  producedUnits: number;
  /** Σ выпуска в кг (брутто). */
  producedKg: number;
  /** Σ брака в кг. */
  defectKg: number;
  /** Чистый выпуск, кг = брутто − брак. */
  netKg: number;
  /** Σ израсходованного сырья, кг (Полипропилен/полуфабрикат — всё в кг). */
  rawKg: number;
  /** Выход, % = чистый выпуск ÷ сырьё × 100 (null, если сырьё не указано). */
  yieldPct: number | null;
}

/** Производственные метрики одной смены (выпуск кг/шт, сырьё, выход %). */
export function shiftMetrics(r: ShiftMetricsInput): ShiftMetrics {
  let producedUnits = 0;
  let producedKg = 0;
  let defectKg = 0;
  for (const o of r.outputs) {
    producedUnits += Number(o.quantity) || 0;
    producedKg += toKg(o.quantity, o.product);
    defectKg += toKg(o.defect_quantity, o.product);
  }
  const rawKg = r.materials.reduce((s, m) => s + materialKg(m), 0);
  const netKg = producedKg - defectKg;
  const yieldPct = rawKg > 0 ? (netKg / rawKg) * 100 : null;
  return { producedUnits, producedKg, defectKg, netKg, rawKg, yieldPct };
}
