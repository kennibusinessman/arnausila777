"use client";

import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { DetailModal } from "@/components/ui/DetailModal";
import { MobileCardList } from "@/components/ui/MobileCardList";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import {
  PermissionsEditor,
  permissionOverrides,
} from "@/components/users/PermissionsEditor";
import { useCan } from "@/lib/auth/permissions";
import { useAuthStore } from "@/lib/auth/store";
import {
  useCreateUser,
  useDeleteUser,
  usePermissionCatalog,
  useUpdateUser,
  useUpdateUserPermissions,
  useUpdateUserRole,
  useUsersList,
} from "@/lib/hooks/useUsers";
import { apiErrorMessage } from "@/lib/api/http";
import { Permission, UserRole } from "@/lib/types/enums";
import type { UserRead } from "@/lib/types/user";
import { formatDate } from "@/lib/utils/format";
import { roleLabels } from "@/lib/utils/roleLabels";

const PAGE_SIZE = 20;

interface FormState {
  full_name: string;
  phone: string;
  email: string;
  role: UserRole;
  temp_password: string;
  is_active: boolean;
}

const emptyForm: FormState = {
  full_name: "",
  phone: "",
  email: "",
  role: UserRole.SALES_MANAGER,
  temp_password: "",
  is_active: true,
};

/** Сколько прав у пользователя отличается от набора его роли. */
const overrideCount = (user: UserRead) => Object.keys(user.permissions ?? {}).length;

export default function UsersPage() {
  const currentUser = useAuthStore((s) => s.user);
  const canManage = useCan(Permission.USERS_MANAGE);
  const canDelete = useCan(Permission.USERS_DELETE);
  const canEditPermissions = useCan(Permission.USERS_PERMISSIONS);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<UserRead | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  // Итоговый набор прав в форме: галочки редактора. Отклонения от роли считаются
  // при сохранении (permissionOverrides).
  const [perms, setPerms] = useState<Set<Permission> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<UserRead | null>(null);

  const { data, isLoading } = useUsersList({ page, size: PAGE_SIZE, search: search || undefined });
  const catalog = usePermissionCatalog(canEditPermissions);
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();
  const updateRole = useUpdateUserRole();
  const updatePermissions = useUpdateUserPermissions();

  const deleteUser = useDeleteUser();

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setPerms(null);
    setError(null);
    setShowForm(true);
  }

  function openEdit(user: UserRead) {
    setEditing(user);
    setForm({
      full_name: user.full_name,
      phone: user.phone ?? "",
      email: user.email,
      role: user.role,
      temp_password: "",
      is_active: user.is_active,
    });
    setPerms(new Set(user.effective_permissions));
    setError(null);
    setShowForm(true);
  }

  /** Смена роли пересобирает галочки под новую роль — прежние отклонения сбрасываются. */
  function changeRole(role: UserRole) {
    setForm((f) => ({ ...f, role }));
    setPerms(null);
  }

  async function savePermissions(userId: string, role: UserRole) {
    if (!canEditPermissions || role === UserRole.SUPER_ADMIN) return;
    const defaults = catalog.data?.role_defaults[role];
    if (!defaults) return; // справочник не загрузился — права не трогаем
    await updatePermissions.mutateAsync({
      id: userId,
      data: { permissions: permissionOverrides(defaults, perms ?? new Set(defaults)) },
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.full_name.trim() || !form.email.trim()) {
      setError("Укажите имя и email");
      return;
    }
    try {
      if (editing) {
        await updateUser.mutateAsync({
          id: editing.id,
          data: { full_name: form.full_name, phone: form.phone || null, is_active: form.is_active },
        });
        if (form.role !== editing.role) {
          await updateRole.mutateAsync({ id: editing.id, data: { role: form.role } });
        }
        await savePermissions(editing.id, form.role);
      } else {
        if (form.temp_password.length < 8) {
          setError("Временный пароль — минимум 8 символов");
          return;
        }
        const created = await createUser.mutateAsync({
          full_name: form.full_name,
          phone: form.phone || null,
          email: form.email,
          role: form.role,
          temp_password: form.temp_password,
          is_active: form.is_active,
        });
        // Права раздаются отдельным запросом — создание их не принимает.
        await savePermissions(created.id, form.role);
      }
      setShowForm(false);
    } catch (err) {
      setError(apiErrorMessage(err, "Не удалось сохранить пользователя"));
    }
  }

  function handleDeactivate(user: UserRead) {
    if (!window.confirm(`Деактивировать пользователя «${user.full_name}»?`)) return;
    deleteUser.mutate(user.id);
  }

  const columns: DataTableColumn<UserRead>[] = [
    { header: "Имя", cell: (row) => <span className="font-medium text-text">{row.full_name}</span> },
    { header: "Email", cell: (row) => row.email },
    {
      header: "Роль",
      cell: (row) => (
        <span className="flex items-center gap-1.5">
          {roleLabels[row.role]}
          {overrideCount(row) > 0 && (
            <Badge
              label={`права ±${overrideCount(row)}`}
              className="bg-primary-50 text-primary"
            />
          )}
        </span>
      ),
    },
    {
      header: "Статус",
      cell: (row) =>
        row.is_active ? (
          <Badge label="Активен" className="bg-success-bg text-green-800" />
        ) : (
          <Badge label="Отключён" className="bg-slate-100 text-slate-600" />
        ),
    },
    { header: "Последний вход", cell: (row) => formatDate(row.last_login_at) },
    {
      header: "",
      align: "right",
      cell: (row) => (
        <div className="flex justify-end gap-1.5">
          {(canManage || canEditPermissions) && (
            <Button variant="ghost" size="sm" onClick={() => openEdit(row)}>
              Изменить
            </Button>
          )}
          {canDelete && row.id !== currentUser?.id && (
            <Button
              variant="ghost"
              size="sm"
              className="text-danger hover:bg-danger-bg"
              onClick={() => handleDeactivate(row)}
            >
              Деактивировать
            </Button>
          )}
        </div>
      ),
    },
  ];

  const total = data?.total ?? 0;
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const to = Math.min(page * PAGE_SIZE, total);
  const rows = data?.items ?? [];

  const paginationControls = (
    <>
      <span>{total === 0 ? "Нет пользователей" : `Показано ${from}–${to} из ${total}`}</span>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          ‹ Назад
        </Button>
        <Button variant="secondary" size="sm" disabled={to >= total} onClick={() => setPage((p) => p + 1)}>
          Вперёд ›
        </Button>
      </div>
    </>
  );

  const saving =
    createUser.isPending ||
    updateUser.isPending ||
    updateRole.isPending ||
    updatePermissions.isPending;

  return (
    <div className="flex flex-col gap-4">
      <div className="glass flex flex-wrap items-end justify-between gap-3 rounded-3xl p-3.5">
        <div>
          <label className="mb-1 block text-xs font-semibold text-muted">Поиск</label>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Имя, email…"
            className="w-64 rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-1.5 text-[13px]"
          />
        </div>
        {canManage && <Button onClick={openCreate}>Создать пользователя</Button>}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <>
          {/* Десктоп (lg+) — таблица */}
          <div className="hidden lg:block">
            <DataTable
              columns={columns}
              rows={rows}
              keyField={(row) => row.id}
              emptyMessage="Пользователи не найдены"
              footer={paginationControls}
            />
          </div>

          {/* Телефон/планшет (< lg) — карточки + поп-ап */}
          <MobileCardList
            rows={rows}
            keyField={(row) => row.id}
            emptyMessage="Пользователи не найдены"
            footer={paginationControls}
            renderCard={(row) => (
              <button
                type="button"
                onClick={() => setSelected(row)}
                className="glass flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform active:scale-[0.99]"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-semibold text-text">{row.full_name}</span>
                    {row.is_active ? (
                      <Badge label="Активен" className="bg-success-bg text-green-800" />
                    ) : (
                      <Badge label="Отключён" className="bg-slate-100 text-slate-600" />
                    )}
                  </div>
                  <span className="truncate text-xs text-muted">{row.email}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted">
                    {roleLabels[row.role]}
                    {overrideCount(row) > 0 && (
                      <Badge
                        label={`права ±${overrideCount(row)}`}
                        className="bg-primary-50 text-primary"
                      />
                    )}
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted" strokeWidth={2} />
              </button>
            )}
          />
        </>
      )}

      <DetailModal
        open={!!selected}
        title={selected?.full_name ?? ""}
        onClose={() => setSelected(null)}
        fields={
          selected
            ? [
                { label: "Email", value: selected.email },
                { label: "Телефон", value: selected.phone ?? "—" },
                { label: "Роль", value: roleLabels[selected.role] },
                { label: "Статус", value: selected.is_active ? "Активен" : "Отключён" },
                {
                  label: "Права",
                  value:
                    overrideCount(selected) > 0
                      ? `Свои: ${overrideCount(selected)} отличий от роли`
                      : "Как у роли",
                },
                { label: "Последний вход", value: formatDate(selected.last_login_at), full: true },
              ]
            : []
        }
        actions={
          selected && (
            <>
              {(canManage || canEditPermissions) && (
                <Button
                  className="flex-1 justify-center"
                  onClick={() => {
                    const u = selected;
                    setSelected(null);
                    openEdit(u);
                  }}
                >
                  Изменить
                </Button>
              )}
              {canDelete && selected.id !== currentUser?.id && (
                <Button
                  variant="danger"
                  onClick={() => {
                    const u = selected;
                    setSelected(null);
                    handleDeactivate(u);
                  }}
                >
                  Деактивировать
                </Button>
              )}
            </>
          )
        }
      />

      <Modal
        open={showForm}
        title={editing ? "Редактировать пользователя" : "Новый пользователь"}
        onClose={() => setShowForm(false)}
      >
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Полное имя</label>
            <input
              type="text"
              value={form.full_name}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-muted"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">Email</label>
              <input
                type="email"
                value={form.email}
                disabled={!!editing || !canManage}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-muted"
              />
            </div>
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">Телефон</label>
              <input
                type="text"
                value={form.phone}
                disabled={!canManage}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-muted"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Роль</label>
            <select
              value={form.role}
              disabled={!canManage}
              onChange={(e) => changeRole(e.target.value as UserRole)}
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-muted"
            >
              {Object.values(UserRole).map((r) => (
                <option key={r} value={r}>
                  {roleLabels[r]}
                </option>
              ))}
            </select>
          </div>
          {!editing && (
            <div>
              <label className="mb-1 block text-[13px] font-semibold text-text">
                Временный пароль
              </label>
              <input
                type="text"
                value={form.temp_password}
                onChange={(e) => setForm({ ...form, temp_password: e.target.value })}
                placeholder="Минимум 8 символов"
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-[13px] font-medium text-text">
            <input
              type="checkbox"
              checked={form.is_active}
              disabled={!canManage}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            Активен
          </label>

          {canEditPermissions && (
            <div className="flex flex-col gap-2 border-t border-border pt-3">
              <span className="text-[13px] font-semibold text-text">Права доступа</span>
              <PermissionsEditor
                catalog={catalog.data}
                isLoading={catalog.isLoading}
                role={form.role}
                value={perms}
                onChange={setPerms}
              />
            </div>
          )}

          {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

          <div className="mt-1 flex gap-2">
            <Button type="submit" disabled={saving}>
              {editing ? "Сохранить" : "Создать"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setShowForm(false)}>
              Отмена
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
