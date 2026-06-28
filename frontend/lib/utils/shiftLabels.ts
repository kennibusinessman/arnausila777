/** Подписи смен. Смена 1 — дневная, Смена 2 — ночная (единый словарь для формы,
 *  карточки отчёта и списка). */
import { ShiftType } from "@/lib/types/enums";

export const SHIFT_TYPE_LABELS: Record<ShiftType, string> = {
  [ShiftType.SHIFT_1]: "Дневная смена",
  [ShiftType.SHIFT_2]: "Ночная смена",
};

/** Короткая подпись для пилюль в таблице. */
export const SHIFT_SHORT_LABELS: Record<ShiftType, string> = {
  [ShiftType.SHIFT_1]: "Дневная",
  [ShiftType.SHIFT_2]: "Ночная",
};
