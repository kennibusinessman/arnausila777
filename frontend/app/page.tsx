"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";
import { roleHomeRoute } from "@/lib/utils/roleHomeRoute";

export default function RootPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(roleHomeRoute(user.role));
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, user, router]);

  return null;
}
