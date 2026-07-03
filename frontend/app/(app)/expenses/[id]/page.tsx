"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expenses/ExpenseForm";
import { useAuthStore } from "@/lib/auth/store";
import { useDeleteExpense, useExpense, useUpdateExpense } from "@/lib/hooks/useExpenses";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import { categoryColor } from "@/lib/utils/expenseCategoryColors";
import { formatCurrency, formatDate } from "@/lib/utils/format";

export default function ExpenseDetailPage() {
  const params = useParams<{ id: string }>();
  const expenseId = params.id;
  const router = useRouter();
  const isSuperAdmin = useAuthStore((s) => s.user?.role) === UserRole.SUPER_ADMIN;

  const { data: expense, isLoading, isError, error } = useExpense(expenseId);
  const updateExpense = useUpdateExpense(expenseId);
  const deleteExpense = useDeleteExpense();

  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }
  if (isError || !expense) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {apiErrorMessage(error, "Расход не найден")}
      </p>
    );
  }

  function handleEditSubmit(values: ExpenseFormValues) {
    setActionError(null);
    updateExpense.mutate(
      {
        name: values.name,
        expense_date: values.expense_date,
        category_id: values.category_id,
        amount: values.amount,
        responsible_id: values.responsible_id || null,
        comment: values.comment || null,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setActionError(apiErrorMessage(err, "Не удалось сохранить расход")),
      }
    );
  }

  function handleDelete() {
    if (!expense) return;
    if (!window.confirm("Удалить расход? Действие необратимо.")) return;
    deleteExpense.mutate(expense.id, {
      onSuccess: () => router.push("/expenses"),
      onError: (err) => setActionError(apiErrorMessage(err, "Не удалось удалить расход")),
    });
  }

  const color = expense.category ? categoryColor(expense.category.id) : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href="/expenses" className="text-sm text-muted hover:text-text">
        ‹ К списку расходов
      </Link>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">{expense.name}</h2>
            <div className="mt-1.5 flex items-center gap-2 text-[13px] text-muted">
              <span>{formatDate(expense.expense_date)}</span>
              {expense.category && (
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${color!.bg} ${color!.text} ${color!.border}`}
                >
                  {expense.category.name}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold text-muted">Сумма</div>
            <div className="text-2xl font-bold text-text">{formatCurrency(expense.amount)}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold text-muted">Ответственный</div>
            <div>{expense.responsible?.full_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Внёс</div>
            <div>{expense.creator?.full_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Создано</div>
            <div>{formatDate(expense.created_at)}</div>
          </div>
        </div>
        {expense.comment && (
          <div className="mt-3 text-sm">
            <div className="text-xs font-semibold text-muted">Примечание</div>
            <div>{expense.comment}</div>
          </div>
        )}
      </Card>

      {actionError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">{actionError}</p>
      )}

      {expense.order_id ? (
        <p className="rounded-lg border border-border bg-black/[0.02] px-3.5 py-2.5 text-sm text-muted">
          Это авто-расход себестоимости сырья по заказу — меняется и удаляется вместе с заказом.{" "}
          <Link href={`/orders/${expense.order_id}`} className="font-medium text-primary hover:underline">
            Открыть заказ ›
          </Link>
        </p>
      ) : (
        !editing && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              Редактировать
            </Button>
            {isSuperAdmin && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDelete}
                className="ml-auto text-danger hover:bg-danger-bg"
              >
                Удалить расход
              </Button>
            )}
          </div>
        )
      )}

      {editing && (
        <Card title="Редактирование расхода">
          <ExpenseForm
            initial={{
              name: expense.name,
              expense_date: expense.expense_date,
              category_id: expense.category_id,
              amount: expense.amount,
              responsible_id: expense.responsible_id ?? "",
              comment: expense.comment ?? "",
            }}
            submitLabel="Сохранить изменения"
            submitting={updateExpense.isPending}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(false)}
          />
        </Card>
      )}
    </div>
  );
}
