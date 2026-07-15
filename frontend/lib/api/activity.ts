import { http } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/store";

/** Пишем активность пользователя (открытие раздела / важная кнопка) в журнал.
 *  Fire-and-forget: без токена не шлём, ошибки глотаем — логирование никогда не
 *  должно мешать работе интерфейса. */
export function logActivity(kind: "page" | "button", label: string): void {
  if (!useAuthStore.getState().accessToken) return;
  void http.post("/activity", { kind, label }).catch(() => {});
}
