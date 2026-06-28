import { ItemType, MovementType, SourceType } from "@/lib/types/enums";

export const itemTypeLabels: Record<ItemType, string> = {
  [ItemType.PRODUCT]: "Товар",
  [ItemType.MATERIAL]: "Материал",
};

export const movementTypeLabels: Record<MovementType, string> = {
  [MovementType.PURCHASE_IN]: "Закупка",
  [MovementType.PRODUCTION_IN]: "Выпуск продукции",
  [MovementType.PRODUCTION_OUT]: "Расход на производство",
  [MovementType.SALE_OUT]: "Продажа",
  [MovementType.ADJUSTMENT_IN]: "Корректировка (+)",
  [MovementType.ADJUSTMENT_OUT]: "Корректировка (−)",
  [MovementType.DEFECT_OUT]: "Брак",
  [MovementType.RETURN_IN]: "Возврат",
};

export const sourceTypeLabels: Record<SourceType, string> = {
  [SourceType.EXPENSE]: "Расход",
  [SourceType.SHIFT_REPORT]: "Сменный отчёт",
  [SourceType.SHIPMENT]: "Отгрузка",
  [SourceType.MANUAL_ADJUSTMENT]: "Ручная корректировка",
  [SourceType.RETURN]: "Возврат",
};
