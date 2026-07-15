/** Перевод журнала аудита с «программного» вида на простой язык:
 *  коды действий → человеческие фразы, тип объекта → русское слово,
 *  поля «Было/Стало» (JSON) → понятные строки «Метка: значение».
 *
 *  Коды берём из вызовов audit_service.log в бэкенде (backend/app/services/*,
 *  routes/*). Незнакомый код не ломает страницу — показываем «очеловеченный» код. */
import { formatCurrency } from "@/lib/utils/format";
import { roleLabels } from "@/lib/utils/roleLabels";
import { SHIFT_TYPE_LABELS } from "@/lib/utils/shiftLabels";
import { movementTypeLabels } from "@/lib/utils/stockLabels";
import { shiftReportStatusStyles } from "@/lib/utils/statusStyles";
import type {
  MovementType,
  ShiftReportStatus,
  ShiftType,
  UserRole,
} from "@/lib/types/enums";

/** Код действия → фраза на простом языке. */
export const ACTION_LABELS: Record<string, string> = {
  USER_LOGIN: "Вход в систему",
  USER_LOGOUT: "Выход из системы",

  CREATE_ORDER: "Создание заказа",
  UPDATE_ORDER: "Изменение заказа",
  PRICE_ORDER: "Простановка цен в заказе",
  DELETE_ORDER: "Удаление заказа",

  CREATE_EXPENSE: "Создание расхода",
  UPDATE_EXPENSE: "Изменение расхода",
  DELETE_EXPENSE: "Удаление расхода",

  CREATE_PAYMENT: "Создание платежа",
  UPDATE_PAYMENT: "Изменение платежа",
  DELETE_PAYMENT: "Удаление платежа",

  CREATE_SHIFT_REPORT: "Создание сменного отчёта",
  UPDATE_SHIFT_REPORT: "Изменение сменного отчёта",
  SUBMIT_SHIFT_REPORT: "Отправка отчёта на утверждение",
  APPROVE_SHIFT_REPORT: "Утверждение сменного отчёта",
  REJECT_SHIFT_REPORT: "Отклонение сменного отчёта",
  DELETE_SHIFT_REPORT: "Удаление сменного отчёта",

  CREATE_SHIPMENT: "Создание отгрузки",

  MANUAL_STOCK_ADJUSTMENT: "Корректировка остатка на складе",
  DELETE_STOCK_MOVEMENT: "Удаление складского движения",

  DELETE_PRODUCT: "Удаление товара",
  DELETE_MATERIAL: "Удаление сырья",

  CREATE_USER: "Создание пользователя",
  UPDATE_USER: "Изменение пользователя",
  UPDATE_USER_ROLE: "Смена роли пользователя",
  DELETE_USER: "Удаление пользователя",

  DELETE_AUDIT_LOG: "Удаление записи журнала",
};

/** Тип объекта → русское слово. */
export const ENTITY_LABELS: Record<string, string> = {
  Auth: "Авторизация",
  Order: "Заказ",
  Expense: "Расход",
  Payment: "Платёж",
  ShiftReport: "Сменный отчёт",
  Shipment: "Отгрузка",
  StockMovement: "Склад",
  Product: "Товар",
  Material: "Сырьё",
  User: "Пользователь",
  Client: "Клиент",
  AuditLog: "Журнал аудита",
};

/** Ключ поля в «Было/Стало» → человеческая подпись. */
const FIELD_LABELS: Record<string, string> = {
  order_number: "Номер заказа",
  shipment_number: "Номер отгрузки",
  total_amount: "Сумма",
  amount: "Сумма",
  price: "Цена",
  default_price: "Цена по умолчанию",
  name: "Название",
  full_name: "ФИО",
  category: "Категория",
  category_id: "Категория",
  subcategory: "Подкатегория",
  sku: "Артикул",
  unit: "Единица",
  base_weight: "Вес единицы, кг",
  min_stock: "Мин. остаток",
  quantity: "Количество",
  is_active: "Активен",
  order_id: "Заказ",
  client_id: "Клиент",
  warehouse_id: "Склад",
  movement_type: "Тип движения",
  email: "Email",
  role: "Роль",
  shift_date: "Дата смены",
  shift_type: "Смена",
  status: "Статус",
  reason: "Причина",
  comment: "Комментарий",
};

/** Незнакомый код: «CREATE_SOMETHING» → «Create something». */
function humanizeCode(code: string): string {
  const s = code.replace(/_/g, " ").toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanizeCode(action);
}

export function entityLabel(entity: string): string {
  return ENTITY_LABELS[entity] ?? entity;
}

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key.replace(/_/g, " ");
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Значение поля в человеческом виде (роли, типы движений, суммы, флаги…). */
function formatFieldValue(key: string, raw: unknown): string {
  if (raw === null || raw === undefined || raw === "") return "—";
  const v = String(raw);
  switch (key) {
    case "role":
      return roleLabels[v as UserRole] ?? v;
    case "movement_type":
      return movementTypeLabels[v as MovementType] ?? v;
    case "shift_type":
      return SHIFT_TYPE_LABELS[v as ShiftType] ?? v;
    case "status":
      return shiftReportStatusStyles[v as ShiftReportStatus]?.label ?? v;
    case "amount":
    case "total_amount":
    case "price":
    case "default_price":
      return formatCurrency(v);
    case "is_active":
      return raw === true || v === "true" ? "Да" : "Нет";
  }
  // UUID (…_id и т.п.) сокращаем до «#xxxxxxxx», чтобы не зашумлять журнал.
  if (UUID_RE.test(v)) return `#${v.slice(0, 8)}`;
  return v;
}

export interface ReadableEntry {
  label: string;
  value: string;
}

/** JSON «Было/Стало» → список понятных пар «Метка: значение». */
export function readableEntries(value: Record<string, unknown> | null): ReadableEntry[] {
  if (!value) return [];
  return Object.entries(value).map(([key, raw]) => ({
    label: fieldLabel(key),
    value: formatFieldValue(key, raw),
  }));
}

/** Короткая сводка для строки таблицы: первые поля через « · ». */
export function auditSummary(log: {
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
}): string {
  const entries = readableEntries(log.new_value ?? log.old_value);
  if (entries.length === 0) return "—";
  return entries
    .slice(0, 3)
    .map((e) => `${e.label}: ${e.value}`)
    .join(" · ");
}

/** Опции выпадающего фильтра «Действие» (код → человеческая подпись). */
export const ACTION_OPTIONS: { value: string; label: string }[] = Object.entries(
  ACTION_LABELS
).map(([value, label]) => ({ value, label }));

/** Опции выпадающего фильтра «Объект». */
export const ENTITY_OPTIONS: { value: string; label: string }[] = Object.entries(
  ENTITY_LABELS
).map(([value, label]) => ({ value, label }));
