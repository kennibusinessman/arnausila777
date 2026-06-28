"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { login as loginRequest, me as fetchMe } from "@/lib/api/auth";
import { apiErrorMessage } from "@/lib/api/http";
import { useAuthStore } from "@/lib/auth/store";
import { setStoredRefreshToken } from "@/lib/auth/tokenStorage";
import { roleHomeRoute } from "@/lib/utils/roleHomeRoute";
import { Button } from "@/components/ui/Button";

const loginSchema = z.object({
  email: z.string().min(1, "Введите email").email("Некорректный email"),
  password: z.string().min(1, "Введите пароль"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(roleHomeRoute(user.role));
    }
  }, [status, user, router]);

  async function onSubmit(values: LoginForm) {
    setFormError(null);
    try {
      const { data: tokens } = await loginRequest(values);
      setStoredRefreshToken(tokens.refresh_token);
      useAuthStore.getState().setAccessToken(tokens.access_token);
      const { data: currentUser } = await fetchMe();
      setSession(currentUser, tokens.access_token);
      router.replace(roleHomeRoute(currentUser.role));
    } catch (error) {
      setFormError(apiErrorMessage(error, "Не удалось войти. Попробуйте снова."));
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4 sm:p-6">
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="glass-strong w-full max-w-[360px] rounded-3xl p-6 shadow-2xl shadow-black/10 sm:p-7"
      >
        <div className="mb-1 flex items-center gap-2.5 text-[17px] font-bold text-text">
          <span className="h-[30px] w-[30px] rounded-lg bg-gradient-to-br from-primary to-indigo" />
          Spunbond CRM
        </div>
        <p className="mb-5 text-[13px] text-muted">Вход в систему управления производством</p>

        <label className="mb-1.5 mt-3.5 block text-[13px] font-semibold text-text">
          Электронная почта
        </label>
        <input
          type="email"
          autoComplete="email"
          className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          {...register("email")}
        />
        {errors.email && <p className="mt-1 text-xs text-danger">{errors.email.message}</p>}

        <label className="mb-1.5 mt-3.5 block text-[13px] font-semibold text-text">Пароль</label>
        <input
          type="password"
          autoComplete="current-password"
          className="w-full rounded-xl border-[1.5px] border-border bg-white/80 px-3 py-2.5 text-sm outline-none focus:border-primary/50"
          {...register("password")}
        />
        {errors.password && <p className="mt-1 text-xs text-danger">{errors.password.message}</p>}

        {formError && (
          <p className="mt-3.5 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
            {formError}
          </p>
        )}

        <Button type="submit" disabled={isSubmitting} className="mt-5 w-full justify-center">
          {isSubmitting ? "Входим…" : "Войти"}
        </Button>

        <div className="mt-4 text-center text-xs text-muted">
          Производство и продажи изделий из спанбонда
        </div>
      </form>
    </div>
  );
}
