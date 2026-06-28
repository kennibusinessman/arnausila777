"use client";

import { clsx } from "clsx";
import { Plus } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { useCreateExpenseCategory, useExpenseCategoryOptions } from "@/lib/hooks/useExpenseCategories";
import { useResponsibleOptions } from "@/lib/hooks/useManagerOptions";
import { apiErrorMessage } from "@/lib/api/http";
import { ExpenseCategoryType } from "@/lib/types/enums";
import { categoryColor } from "@/lib/utils/expenseCategoryColors";

export interface ExpenseFormValues {
  name: string;
  expense_date: string;
  category_id: string;
  amount: string;
  responsible_id: string;
  comment: string;
}

interface ExpenseFormProps {
  initial: ExpenseFormValues;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  onSubmit: (values: ExpenseFormValues) => void;
  onCancel?: () => void;
}

export function ExpenseForm({ initial, submitLabel, submitting, error, onSubmit, onCancel }: ExpenseFormProps) {
  const [name, setName] = useState(initial.name);
  const [expenseDate, setExpenseDate] = useState(initial.expense_date);
  const [categoryId, setCategoryId] = useState(initial.category_id);
  const [amount, setAmount] = useState(initial.amount);
  const [responsibleId, setResponsibleId] = useState(initial.responsible_id);
  const [comment, setComment] = useState(initial.comment);
  const [localError, setLocalError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  const categories = useExpenseCategoryOptions();
  const responsibleOptions = useResponsibleOptions();
  const createCategory = useCreateExpenseCategory();

  function handleCreateCategory() {
    const label = newCategoryName.trim();
    if (!label) return;
    setLocalError(null);
    createCategory.mutate(
      { name: label, type: ExpenseCategoryType.OTHER, is_active: true },
      {
        onSuccess: (category) => {
          setCategoryId(category.id);
          setAddingCategory(false);
          setNewCategoryName("");
        },
        onError: (err) => setLocalError(apiErrorMessage(err, "Не удалось создать категорию")),
      }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setLocalError("Укажите описание расхода");
      return;
    }
    if (!categoryId) {
      setLocalError("Выберите категорию расхода");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      setLocalError("Укажите сумму больше нуля");
      return;
    }
    setLocalError(null);
    onSubmit({ name: name.trim(), expense_date: expenseDate, category_id: categoryId, amount, responsible_id: responsibleId, comment });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-text">Описание расхода</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Напр. Аренда производственного цеха"
          className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Дата</label>
          <input
            type="date"
            value={expenseDate}
            onChange={(e) => setExpenseDate(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Сумма, ₸</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-text">Категория</label>
        <div className="flex flex-wrap gap-1.5">
          {(categories.data ?? []).map((c) => {
            const color = categoryColor(c.id);
            const active = categoryId === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategoryId(c.id)}
                className={clsx(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active ? `${color.bg} ${color.text} ${color.border}` : "border-border text-muted hover:bg-black/[0.03]"
                )}
              >
                <span className={clsx("h-2 w-2 rounded-full", color.dot)} />
                {c.name}
              </button>
            );
          })}

          {addingCategory ? (
            <div className="flex items-center gap-1.5">
              <input
                autoFocus
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
                placeholder="Название категории"
                className="rounded-full border border-border px-3 py-1.5 text-[12.5px] outline-none focus:border-primary"
              />
              <Button type="button" size="sm" disabled={createCategory.isPending} onClick={handleCreateCategory}>
                {createCategory.isPending ? "…" : "Создать"}
              </Button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAddingCategory(true)}
              className="flex items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-[12.5px] font-medium text-muted hover:bg-black/[0.03]"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2} />
              Категория
            </button>
          )}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-text">Ответственный</label>
        <div className="flex flex-wrap gap-1.5">
          {(responsibleOptions.data ?? []).map((u) => {
            const active = responsibleId === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => setResponsibleId(u.id)}
                className={clsx(
                  "rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active ? "border-primary/40 bg-primary-50 text-primary" : "border-border text-muted hover:bg-black/[0.03]"
                )}
              >
                {u.full_name}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-[13px] font-semibold text-text">
          Примечание (необязательно)
        </label>
        <input
          type="text"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
        />
      </div>

      {(localError || error) && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{localError || error}</p>
      )}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting ? "Сохранение…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={submitting}>
            Отмена
          </Button>
        )}
      </div>
    </form>
  );
}
