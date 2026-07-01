import { http } from "@/lib/api/http";
import type { SettingsRead, SettingsUpdate } from "@/lib/types/settings";

export const getSettings = () => http.get<SettingsRead>("/settings");

export const updateSettings = (data: SettingsUpdate) =>
  http.put<SettingsRead>("/settings", data);
