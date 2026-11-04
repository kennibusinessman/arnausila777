/** Зеркало backend/app/schemas/production_plan.py */

export const ProductionTaskStatus = {
  QUEUED: "QUEUED",
  IN_PROGRESS: "IN_PROGRESS",
  DONE: "DONE",
  CANCELLED: "CANCELLED",
} as const;
export type ProductionTaskStatus = (typeof ProductionTaskStatus)[keyof typeof ProductionTaskStatus];

/** Линия: простыни (из бабин) или спанбонд (из полипропилена). У каждой своя очередь. */
export type ProductionTaskKind = "SHEETS" | "SPUNBOND";

/** Спанбонд: хватит ли полипропилена с учётом позиций выше; no_weight — у товара нет веса. */
export type RawStatus = "ok" | "partial" | "none" | "no_weight" | "done";

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
  /** Целых бабин на позицию (с округлением вверх). */
  bobbins_needed: number | null;
  bobbin_status: BobbinStatus | null;
  bobbins_short: number | null;
  /** Лишние простыни из-за округления до целой бабины — останутся на складе. */
  leftover_sheets: number | null;
  shifts_needed: string | null;
  eta: string | null;
  // --- только спанбонд ---
  color?: string | null;
  /** Кг полипропилена на оставшееся; null — нет веса. */
  kg_needed?: string | null;
  raw_status?: RawStatus | null;
  raw_short_kg?: string | null;
}

export interface TaskRow {
  id: string;
  kind: ProductionTaskKind;
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

/** Позиция очереди, которая берёт бабину. Бабины целые, склад расходуется сверху вниз. */
export interface BobbinUse {
  task_id: string;
  item_id: string;
  /** Номер задания в очереди (1 — первое). */
  queue_no: number;
  client_name: string | null;
  /** Комментарий задания: у одного клиента бывает несколько (склад, другое ТОО…). */
  comment?: string | null;
  product_name: string;
  /** Сколько простыней осталось сделать. */
  sheets: number;
  needed: number;
  from_stock: number;
  short: number;
  /** Лишние простыни из-за округления — останутся на складе. */
  leftover_sheets: number;
}

export interface BobbinNeed {
  bobbin_id: string;
  name: string;
  /** Цвет из названия; null — не распознан. */
  color: string | null;
  roll_norm: number;
  on_stock: string;
  needed: number;
  shortage: number;
  leftover_sheets: number;
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
  /** Штук ушло по утверждённым сменным отчётам. */
  used?: string;
  /** Сколько раз выбирали вручную в заданиях. */
  chosen?: number;
}

export interface PlanProductOption {
  id: string;
  name: string;
  unit: string;
  bobbins: PlanBobbinOption[];
  // спанбонд
  subcategory?: string | null;
  color?: string | null;
  /** Кг сырья на единицу; null — у товара в штуках нет веса. */
  kg_per_unit?: string | null;
  on_stock?: string | null;
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
  kind?: ProductionTaskKind;
  client_id?: string | null;
  deadline?: string | null;
  comment?: string | null;
  items: TaskItemIn[];
}

export type TaskUpdate = Partial<TaskCreate> & {
  status?: ProductionTaskStatus;
};

// --- План спанбонда (backend/app/services/spunbond_plan_service.py) ---

export interface SpunbondSettings {
  kg_per_shift: number;
  shifts_per_day: number;
}

/** Строка общего плана по цветам: позиция очереди спанбонда или бабины для простыней. */
export interface ColorEntry {
  source: "queue" | "sheets";
  task_id: string;
  item_id: string;
  queue_no: number;
  client_name: string | null;
  comment?: string | null;
  product_name: string;
  quantity: number;
  unit: string;
  kg: string | null;
  eta: string | null;
  deadline: string | null;
  late: boolean;
  /** Для бабин: простыня, под которую они нужны. */
  for_product: string | null;
}

export interface ColorPlan {
  color: string | null;
  kg: string;
  queue_kg: string;
  sheets_kg: string;
  no_weight: number;
  entries: ColorEntry[];
}

export interface RawStock {
  material_id: string;
  name: string;
  on_stock: string;
}

export interface SpunbondPlanResponse {
  settings: SpunbondSettings;
  tasks: TaskRow[];
  colors: ColorPlan[];
  offers: Offer[];
  raw: RawStock[];
  raw_on_stock: string;
  queue_kg: string;
  sheets_kg: string;
  raw_short: string;
  no_weight: number;
  total_shifts: string;
  finish_date: string | null;
}
