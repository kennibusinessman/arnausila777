import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSettings, updateSettings } from "@/lib/api/settings";
import type { SettingsRead, SettingsUpdate } from "@/lib/types/settings";

/** Системные настройки (экономика). Цена сырья нужна на многих экранах — кэшируем подольше. */
export function useSettings() {
  return useQuery({
    queryKey: ["settings"],
    queryFn: () => getSettings().then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SettingsUpdate) => updateSettings(data).then((r) => r.data),
    onSuccess: (data: SettingsRead) => qc.setQueryData(["settings"], data),
  });
}
