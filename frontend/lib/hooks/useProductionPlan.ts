import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTask,
  deleteTask,
  getPlan,
  getPlanOptions,
  getSpunbondPlan,
  markItemReady,
  markItemShipped,
  reorderSpunbond,
  reorderTasks,
  type ItemQuantity,
  updatePlanSettings,
  updateSpunbondSettings,
  updateTask,
} from "@/lib/api/productionPlan";
import type {
  PlanResponse,
  PlanSettings,
  ProductionTaskKind,
  SpunbondPlanResponse,
  SpunbondSettings,
  TaskCreate,
  TaskUpdate,
} from "@/lib/types/productionPlan";

const KEY = ["production-plan"];
const SP_KEY = ["production-plan", "spunbond"];

/** План простыней: очередь с расчётом, потребность в бабинах, предложения по свободному остатку. */
export function useProductionPlan(enabled = true) {
  return useQuery({
    queryKey: KEY,
    queryFn: () => getPlan().then((r) => r.data),
    enabled,
  });
}

/** План спанбонда: очередь, полипропилен, общий план по цветам (с бабинами для простыней). */
export function useSpunbondPlan(enabled = true) {
  return useQuery({
    queryKey: SP_KEY,
    queryFn: () => getSpunbondPlan().then((r) => r.data),
    enabled,
  });
}

export function usePlanOptions(enabled = true, kind: ProductionTaskKind = "SHEETS") {
  return useQuery({
    queryKey: [...KEY, "options", kind],
    queryFn: () => getPlanOptions(kind).then((r) => r.data.products),
    enabled,
  });
}

/**
 * Правки заданий (общие для обеих линий) возвращают пересчитанный план простыней —
 * кладём его в кэш. План спанбонда зависит от простыней (бабины для них) и наоборот,
 * поэтому его перечитываем.
 */
function usePlanMutation<V>(fn: (vars: V) => Promise<{ data: PlanResponse }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(vars).then((r) => r.data),
    onSuccess: (plan) => {
      qc.setQueryData(KEY, plan);
      qc.invalidateQueries({ queryKey: SP_KEY, exact: true });
    },
  });
}

function useSpunbondMutation<V>(fn: (vars: V) => Promise<{ data: SpunbondPlanResponse }>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => fn(vars).then((r) => r.data),
    onSuccess: (plan) => qc.setQueryData(SP_KEY, plan),
  });
}

export const useCreateTask = () => usePlanMutation((data: TaskCreate) => createTask(data));

export const useUpdateTask = () =>
  usePlanMutation(({ id, data }: { id: string; data: TaskUpdate }) => updateTask(id, data));

/** «Готово»: отложить для клиента N готовых единиц со склада. */
export const useMarkReady = () => usePlanMutation((v: ItemQuantity) => markItemReady(v));

/** «Отгрузить»: отметить, что N готовых единиц ушли клиенту. */
export const useMarkShipped = () => usePlanMutation((v: ItemQuantity) => markItemShipped(v));

export const useReorderTasks = () => usePlanMutation((ids: string[]) => reorderTasks(ids));

export const useUpdatePlanSettings = () => usePlanMutation((data: PlanSettings) => updatePlanSettings(data));

export const useReorderSpunbond = () => useSpunbondMutation((ids: string[]) => reorderSpunbond(ids));

export const useUpdateSpunbondSettings = () =>
  useSpunbondMutation((data: SpunbondSettings) => updateSpunbondSettings(data));

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
