/** Зеркало backend/app/schemas/shift_report.py */
import type { ShiftReportStatus, ShiftType } from "./enums";

export interface WorkerIn {
  worker_id: string;
  hours_worked?: string | null;
  comment?: string | null;
}

export interface OutputIn {
  product_id: string;
  quantity: string;
  defect_quantity?: string;
  comment?: string | null;
}

export interface MaterialIn {
  /** Ровно одно из material_id / product_id. material_id — обычное сырьё
   * (Полипропилен); product_id — спанбонд-полуфабрикат (Бабины / Дастархан сырьё). */
  material_id?: string | null;
  product_id?: string | null;
  quantity_used: string;
  comment?: string | null;
}

export interface ShiftReportCreate {
  shift_date: string;
  shift_type: ShiftType;
  comment?: string | null;
  downtime_hours?: string;
  master_id?: string | null;
  workers?: WorkerIn[];
  outputs?: OutputIn[];
  materials?: MaterialIn[];
}

export interface ShiftReportUpdate {
  shift_date?: string | null;
  shift_type?: ShiftType | null;
  comment?: string | null;
  downtime_hours?: string | null;
  workers?: WorkerIn[] | null;
  outputs?: OutputIn[] | null;
  materials?: MaterialIn[] | null;
}

export interface RejectRequest {
  comment: string;
}

export interface ApproveRequest {
  raw_warehouse_id?: string | null;
  finished_warehouse_id?: string | null;
}

interface UserBrief {
  id: string;
  full_name: string;
}

interface ProductBrief {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  category?: string | null;
  subcategory?: string | null;
  /** Вес единицы (кг) — для расчёта выпуска смены в кг и выхода (% сырья → продукт). */
  base_weight?: string | null;
}

interface MaterialBrief {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
}

export interface WorkerRead {
  id: string;
  worker_id: string;
  hours_worked: string | null;
  comment: string | null;
  worker?: UserBrief | null;
}

export interface OutputRead {
  id: string;
  product_id: string;
  quantity: string;
  defect_quantity: string;
  comment: string | null;
  product?: ProductBrief | null;
}

export interface ShiftMaterialRead {
  id: string;
  material_id: string | null;
  product_id: string | null;
  quantity_used: string;
  comment: string | null;
  material?: MaterialBrief | null;
  product?: ProductBrief | null;
}

export interface ShiftReportRead {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  master_id: string;
  status: ShiftReportStatus;
  comment: string | null;
  downtime_hours: string;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  master?: UserBrief | null;
  approver?: UserBrief | null;
  workers: WorkerRead[];
  outputs: OutputRead[];
  materials: ShiftMaterialRead[];
}

export interface ShiftReportListItem {
  id: string;
  shift_date: string;
  shift_type: ShiftType;
  master_id: string;
  status: ShiftReportStatus;
  downtime_hours: string;
  approved_at: string | null;
  created_at: string;
  master?: UserBrief | null;
  outputs: OutputRead[];
  materials: ShiftMaterialRead[];
}
