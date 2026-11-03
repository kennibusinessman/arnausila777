/** Зеркало backend/app/schemas/production_plan.py */

export const ProductionTaskStatus = {
  QUEUED: "QUEUED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type ProductionTaskStatus = (typeof ProductionTaskStatus)[keyof typeof ProductionTaskStatus];

/** ok — бабин хватает, partial — частично, none — нет, no_norm — нет нормы/бабины, done — всё закреплено. */
export type BobbinStatus = "ok" | "partial" | "none" | "no_norm" | "done";

/** Заказ со страницы «Заказы», засчитанный в отгрузку позиции. */
export interface ItemOrder {
  order_id: string;
  order_number: string;
  quantity: number;
}

export interface ItemRow {
  id: string;
  line_no: number;
  product_id: string;
  product_name: string;
  unit: string;
  bobbin_id: string | null;
  plan_bobbin_id: string | null;
  plan_bobbin_name: string | null;
  roll_norm: number | null;
  quantity: number;
  /** Готово — отложено для клиента со склада. */
  ready: number;
  /** Отгружено клиенту (только отметка, склад не меняется). */
  shipped: number;
  /** Осталось сделать = заказано − готово. */
  remaining: number;
  /** Готово, но ещё не отгружено. */
  awaiting_shipment: number;
  /** Из отгруженного — по каким заказам; остальное — ручные отметки. */
  orders: ItemOrder[];
  bobbins_needed: string | null;
  bobbin_status: BobbinStatus | null;
  bobbins_short: string | null;
  shifts_needed: string | null;
  eta: string | null;
}

export interface TaskRow {
  id: string;
  position: number;
  status: ProductionTaskStatus;
  client_id: string | null;
  client_name: string | null;
  deadline: string | null;
  comment: string | null;
  items: ItemRow[];
  quantity: number;
  ready: number;
  shipped: number;
  remaining: number;
  eta: string | null;
  late: boolean;
}

/** Сколько бабины уходит на одну позицию очереди и сколько из этого покрывает склад. */
export interface BobbinUse {
  task_id: string;
  item_id: string;
  /** Номер задания в очереди (1 — первое). */
  queue_no: number;
  client_name: string | null;
  product_name: string;
  needed: string;
  from_stock: string;
  short: string;
}

export interface BobbinNeed {
  bobbin_id: string;
  name: string;
  roll_norm: number;
  on_stock: string;
  needed: string;
  shortage: number;
  leftover_sheets: number;
  /** Раскладка по заданиям очереди — сверху вниз. */
  uses: BobbinUse[];
}

export interface Offer {
  task_id: string;
  item_id: string;
  product_id: string;
  product_name: string;
  client_id: string | null;
  client_name: string | null;
  free: string;
  quantity: number;
}

export interface FreeStock {
  product_id: string;
  product_name: string;
  on_stock: string;
  reserved: number;
  free: string;
}

export interface PlanSettings {
  sheets_per_shift: number;
  shifts_per_day: number;
}

export interface PlanResponse {
  settings: PlanSettings;
  tasks: TaskRow[];
  bobbins: BobbinNeed[];
  offers: Offer[];
  free_stock: FreeStock[];
  total_remaining: number;
  total_shifts: string;
  finish_date: string | null;
}

export interface PlanBobbinOption {
  id: string;
  name: string;
  roll_norm: number | null;
  on_stock: string;
}

export interface PlanProductOption {
  id: string;
  name: string;
  unit: string;
  bobbins: PlanBobbinOption[];
}

export interface TaskItemIn {
  /** Существующая позиция; без id — новая. */
  id?: string;
  product_id: string;
  bobbin_id?: string | null;
  quantity: number;
  ready?: number;
  shipped?: number;
}

export interface TaskCreate {
  client_id?: string | null;
  deadline?: string | null;
  comment?: string | null;
  items: TaskItemIn[];
}

export type TaskUpdate = Partial<TaskCreate> & {
  status?: ProductionTaskStatus;
};
