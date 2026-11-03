import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  getPlan,
  getPlanOptions,
  markItemReady,
  markItemShipped,
  reorderTasks,
  type ItemQuantity,
  updatePlanSettings,
  updateTask,
} from "@/lib/api/productionPlan";
import type { PlanResponse, PlanSettings, TaskCreate, TaskUpdate } from "@/lib/types/productionPlan";

const KEY = ["production-plan"];

/** План целиком: очередь с расчётом, потребность в бабинах, предложения по свободному остатку. */
export function useProductionPlan(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => getPlan().then((r) => r.data),
    enabled,
  });
}

export function usePlanOptions(enabled = true) {
  return useQuery({
    queryKey: [...KEY, "options"],
    queryFn: () => getPlanOptions().then((r) => r.data.products),
    enabled,
  });
}

/** Каждая правка возвращает пересчитанный план — кладём его в кэш без лишнего запроса. */
function usePlanMutation<V>(fn: (vars: V) => Promise<{ data: PlanResponse }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(vars).then((r) => r.data),
    onSuccess: (plan) => qc.setQueryData(KEY, plan),
  });
}

export const useCreateTask = () => usePlanMutation((data: TaskCreate) => createTask(data));

export const useUpdateTask = () =>
  usePlanMutation(({ id, data }: { id: string; data: TaskUpdate }) => updateTask(id, data));

/** «Готово»: отложить для клиента N готовых штук со склада. */
export const useMarkReady = () => usePlanMutation((v: ItemQuantity) => markItemReady(v));

/** «Отгрузить»: отметить, что N готовых штук ушли клиенту. */
export const useMarkShipped = () => usePlanMutation((v: ItemQuantity) => markItemShipped(v));

export const useReorderTasks = () => usePlanMutation((ids: string[]) => reorderTasks(ids));

export const useUpdatePlanSettings = () => usePlanMutation((data: PlanSettings) => updatePlanSettings(data));

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
