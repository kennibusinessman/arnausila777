import { PaymentMethod } from "@/lib/types/enums";

/** Цвет/фон/точка для «таблеток» способа оплаты — палитра из design-system (зелёный/синий/фиолетовый/красный). */
export interface PaymentMethodMeta {
  /** Короткая подпись для фильтров и таблиц (полная — в paymentMethodLabels). */
  short: string;
  color: string;
  bg: string;
  border: string;
  dot: string;
}

export const paymentMethodMeta: Record<PaymentMethod, PaymentMethodMeta> = {
  [PaymentMethod.CASH]: {
    short: "Наличные",
    color: "#178a55",
    bg: "rgba(31,157,99,0.12)",
    border: "rgba(31,157,99,0.24)",
    dot: "#1f9d63",
  },
  [PaymentMethod.CARD]: {
    short: "Карта",
    color: "#3f6fd6",
    bg: "rgba(91,141,239,0.13)",
    border: "rgba(91,141,239,0.26)",
    dot: "#5b8def",
  },
  [PaymentMethod.BANK_TRANSFER]: {
    short: "Перевод",
    color: "#6d52cc",
    bg: "rgba(141,107,255,0.13)",
    border: "rgba(141,107,255,0.26)",
    dot: "#8d6bff",
  },
  [PaymentMethod.OTHER]: {
    short: "Другое",
    color: "#bd4836",
    bg: "rgba(214,85,63,0.12)",
    border: "rgba(214,85,63,0.24)",
    dot: "#e3563f",
  },
};

/** Градиенты для круглых аватаров клиентов — выбираются детерминированно по строке. */
const AVATAR_GRADIENTS = [
  "linear-gradient(140deg,#f3a78b,#e87aa6)",
  "linear-gradient(140deg,#5b8def,#7aa6ff)",
  "linear-gradient(140deg,#8d6bff,#b08bff)",
  "linear-gradient(140deg,#3fc6c6,#5bd9c4)",
  "linear-gradient(140deg,#f0a23c,#f5c06b)",
  "linear-gradient(140deg,#5bc0eb,#7ad3f0)",
  "linear-gradient(140deg,#e87aa6,#f3a78b)",
  "linear-gradient(140deg,#6366f1,#8d6bff)",
];

export function avatarGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] ?? "linear-gradient(140deg,#5b8def,#7aa6ff)";
}

/** Инициалы клиента: «Анна Петрова» → «АП», одиночное имя → первые две буквы. */
export function initialsOf(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  const second = parts[1] ?? "";
  if (first && second) return (first.charAt(0) + second.charAt(0)).toUpperCase();
  return (first.slice(0, 2) || "?").toUpperCase();
}
