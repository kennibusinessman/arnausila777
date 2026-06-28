"use client";

import { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ExpenseForm, type ExpenseFormValues } from "@/components/expenses/ExpenseForm";
import { useAuthStore } from "@/lib/auth/store";
import { useCreateExpense } from "@/lib/hooks/useExpenses";
import { apiErrorMessage } from "@/lib/api/http";

interface CreateExpenseModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (expenseId: string) => void;
}

function emptyValues(responsibleId: string): ExpenseFormValues {
  return {
    name: "",
    expense_date: new Date().toISOString().slice(0, 10),
    category_id: "",
    amount: "",
    responsible_id: responsibleId,
    comment: "",
  };
}

export function CreateExpenseModal({ open, onClose, onCreated }: CreateExpenseModalProps) {
  const currentUserId = useAuthStore((s) => s.user?.id) ?? "";
  const createExpense = useCreateExpense();
  const [error, setError] = useState<string | null>(null);
  const [key, setKey] = useState(0);

  function handleClose() {
    if (createExpense.isPending) return;
    setError(null);
    setKey((k) => k + 1); // сбрасывает форму к initial при повторном открытии
    onClose();
  }

  function handleSubmit(values: ExpenseFormValues) {
    setError(null);
    createExpense.mutate(
      {
        name: values.name,
        expense_date: values.expense_date,
        category_id: values.category_id,
        amount: values.amount,
        responsible_id: values.responsible_id || null,
        comment: values.comment || null,
      },
      {
        onSuccess: (expense) => {
          setKey((k) => k + 1);
          onClose();
          onCreated(expense.id);
        },
        onError: (err) => setError(apiErrorMessage(err, "Не удалось создать расход")),
      }
    );
  }

  return (
    <Modal open={open} title="Новый расход" onClose={handleClose}>
      <ExpenseForm
        key={key}
        initial={emptyValues(currentUserId)}
        submitLabel="Создать расход"
        submitting={createExpense.isPending}
        error={error}
        onSubmit={handleSubmit}
        onCancel={handleClose}
      />
    </Modal>
  );
}
