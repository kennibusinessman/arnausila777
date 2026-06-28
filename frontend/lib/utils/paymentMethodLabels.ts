import { PaymentMethod } from "@/lib/types/enums";

export const paymentMethodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.CASH]: "Наличные",
  [PaymentMethod.BANK_TRANSFER]: "Безналичный перевод",
  [PaymentMethod.CARD]: "Карта",
  [PaymentMethod.OTHER]: "Другое",
};
