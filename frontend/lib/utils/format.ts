/** Денежные суммы в проекте — тенге (₸), формат "4 250 000 ₸" (см. design-system/components/kpi-cards.html). */
export function formatCurrency(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(num)} ₸`;
}

/** Компактная сумма для таблиц/бейджей: "4,8 млн ₸", "560 тыс ₸", "0 ₸". */
export function formatCompactCurrency(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num) || num === 0) return "0 ₸";
  const abs = Math.abs(num);
  const sign = num < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1).replace(/\.0$/, "")} млн ₸`;
  if (abs >= 10_000) return `${sign}${Math.round(abs / 1000)} тыс ₸`;
  return formatCurrency(num);
}

/** Вес всегда в килограммах — "77,5 кг", "8 400 кг" (тонны не используем; см. Product.base_weight). */
export function formatWeight(value: string | number): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return `${new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 }).format(num)} кг`;
}

/** Процент — "40 %", "12,5 %". null/нечисло → "—". */
export function formatPercent(value: number | null, fractionDigits = 0): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)} %`;
}

export function formatNumber(value: string | number, fractionDigits = 0): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(num);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }).format(
    date
  );
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

/** «25 июн 2026» — компактный «живой» формат даты для платежей/отгрузок. */
export function formatDayMonth(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
