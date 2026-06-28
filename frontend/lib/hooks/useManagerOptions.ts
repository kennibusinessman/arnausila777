import { useQuery } from "@tanstack/react-query";
import { listUsers } from "@/lib/api/users";
import { UserRole } from "@/lib/types/enums";

/**
 * Список менеджеров по продажам для ручного назначения в заказе (доступно только SA/B).
 * GET /api/users не фильтрует по роли на backend — фильтруем на клиенте.
 */
export function useManagerOptions(enabled: boolean) {
  return useQuery({
    queryKey: ["manager-options"],
    queryFn: () =>
      listUsers({ size: 100 }).then((r) =>
        r.data.items.filter((u) => u.role === UserRole.SALES_MANAGER && u.is_active)
      ),
    enabled,
    staleTime: 60_000,
  });
}

/** Список активных сотрудников для выбора «Ответственного» за статью расхода. */
export function useResponsibleOptions() {
  return useQuery({
    queryKey: ["responsible-options"],
    queryFn: () => listUsers({ size: 100 }).then((r) => r.data.items.filter((u) => u.is_active)),
    staleTime: 60_000,
  });
}
