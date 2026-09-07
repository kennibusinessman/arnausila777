"use client";

import { clsx } from "clsx";
import { RotateCcw } from "lucide-react";
import { Permission, UserRole } from "@/lib/types/enums";
import type { PermissionCatalog } from "@/lib/types/user";
import { roleLabels } from "@/lib/utils/roleLabels";

interface PermissionsEditorProps {
  catalog: PermissionCatalog | undefined;
  isLoading?: boolean;
  /** Роль, выбранная в форме: относительно неё считаются отклонения. */
  role: UserRole;
  /** Итоговый набор прав (галочки); null — «как у роли». */
  value: Set<Permission> | null;
  onChange: (next: Set<Permission>) => void;
}

/**
 * Редактор индивидуальных прав. Галочки показывают ИТОГОВЫЙ набор; всё, что
 * отличается от набора роли, помечается как «изменено» и уходит на бэкенд
 * отдельным словарём отклонений (PATCH /users/{id}/permissions).
 */
export function PermissionsEditor({
  catalog,
  isLoading,
  role,
  value,
  onChange,
}: PermissionsEditorProps) {
  if (role === UserRole.SUPER_ADMIN) {
    return (
      <p className="rounded-xl bg-black/[0.03] px-3 py-2 text-[12.5px] text-muted">
        У супер-админа всегда все права — их нельзя ограничить.
      </p>
    );
  }

  if (isLoading || !catalog) {
    return <p className="text-[12.5px] text-muted">Загрузка справочника прав…</p>;
  }

  const defaults = new Set(catalog.role_defaults[role] ?? []);
  const effective = value ?? defaults;
  const changedCount = [...new Set([...defaults, ...effective])].filter(
    (p) => defaults.has(p) !== effective.has(p)
  ).length;

  function toggle(perm: Permission) {
    const next = new Set(effective);
    if (next.has(perm)) next.delete(perm);
    else next.add(perm);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[12.5px] text-muted">
          Галочки по умолчанию — права роли «{roleLabels[role]}».{" "}
          {changedCount > 0 ? `Изменено: ${changedCount}.` : "Отклонений нет."}
        </span>
        <button
          type="button"
          disabled={changedCount === 0}
          onClick={() => onChange(new Set(defaults))}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12.5px] font-medium text-muted transition-colors hover:bg-white/70 hover:text-text disabled:opacity-40 disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-3.5 w-3.5" strokeWidth={2} />
          Сбросить к правам роли
        </button>
      </div>

      <div className="max-h-[320px] overflow-y-auto rounded-xl border-[1.5px] border-border bg-white/60 p-2">
        {catalog.groups.map((group) => (
          <div key={group.group} className="mb-2 last:mb-0">
            <div className="px-1 py-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted">
              {group.group}
            </div>
            <div className="grid gap-0.5">
              {group.items.map((item) => {
                const checked = effective.has(item.key);
                const changed = defaults.has(item.key) !== checked;
                return (
                  <label
                    key={item.key}
                    className={clsx(
                      "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-white/80",
                      changed ? "text-text" : "text-muted"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(item.key)}
                      className="shrink-0"
                    />
                    <span className="flex-1">{item.label}</span>
                    {changed && (
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                          checked ? "bg-success-bg text-green-800" : "bg-danger-bg text-danger"
                        )}
                      >
                        {checked ? "выдано" : "снято"}
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Отклонения от прав роли — то, что уходит в PATCH /users/{id}/permissions. */
export function permissionOverrides(
  defaults: Permission[] | undefined,
  value: Set<Permission>
): Partial<Record<Permission, boolean>> {
  const base = new Set(defaults ?? []);
  const overrides: Partial<Record<Permission, boolean>> = {};
  for (const perm of Object.values(Permission)) {
    if (base.has(perm) !== value.has(perm)) overrides[perm] = value.has(perm);
  }
  return overrides;
}
