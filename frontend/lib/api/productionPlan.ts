import { http } from "@/lib/api/http";
import type {
  PlanProductOption,
  PlanResponse,
  PlanSettings,
  TaskCreate,
  TaskUpdate,
} from "@/lib/types/productionPlan";

export const getPlan = () => http.get<PlanResponse>("/production-plan");

export const getPlanOptions = () =>
  http.get<{ products: PlanProductOption[] }>("/production-plan/options");

export const createTask = (data: TaskCreate) => http.post<PlanResponse>("/production-plan/tasks", data);

export const updateTask = (id: string, data: TaskUpdate) =>
  http.patch<PlanResponse>(`/production-plan/tasks/${id}`, data);

export const deleteTask = (id: string) => http.delete(`/production-plan/tasks/${id}`);

export interface ItemQuantity {
  taskId: string;
  itemId: string;
  quantity: number;
}

export const markItemReady = ({ taskId, itemId, quantity }: ItemQuantity) =>
  http.post<PlanResponse>(`/production-plan/tasks/${taskId}/items/${itemId}/ready`, { quantity });

export const markItemShipped = ({ taskId, itemId, quantity }: ItemQuantity) =>
  http.post<PlanResponse>(`/production-plan/tasks/${taskId}/items/${itemId}/ship`, { quantity });

export const reorderTasks = (ids: string[]) => http.post<PlanResponse>("/production-plan/reorder", { ids });

export const updatePlanSettings = (data: PlanSettings) =>
  http.put<PlanResponse>("/production-plan/settings", data);
