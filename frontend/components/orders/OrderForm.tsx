"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { OrderItemsEditor } from "@/components/orders/OrderItemsEditor";
import { useClientOptions } from "@/lib/hooks/useClients";
import { useManagerOptions } from "@/lib/hooks/useManagerOptions";
import { useProductOptions } from "@/lib/hooks/useProducts";
import type { OrderItemCreate } from "@/lib/types/order";

export interface OrderFormValues {
  client_id: string;
  deadline: string;
  comment: string;
  manager_id: string | null;
  items: OrderItemCreate[];
}

interface OrderFormProps {
  initial: OrderFormValues;
  isAdmin: boolean;
  submitLabel: string;
  submitting?: boolean;
  error?: string | null;
  /** Правка только шапки: позиции уже списаны со склада и не меняются. */
  headerOnly?: boolean;
  onSubmit: (values: OrderFormValues) => void;
  onCancel?: () => void;
}

export function OrderForm({
  initial,
  isAdmin,
  submitLabel,
  submitting,
  error,
  headerOnly,
  onSubmit,
  onCancel,
}: OrderFormProps) {
  const [clientId, setClientId] = useState(initial.client_id);
  const [deadline, setDeadline] = useState(initial.deadline);
  const [comment, setComment] = useState(initial.comment);
  const [managerId, setManagerId] = useState<string | null>(initial.manager_id);
  const [items, setItems] = useState<OrderItemCreate[]>(initial.items);
  const [localError, setLocalError] = useState<string | null>(null);

  const clients = useClientOptions();
  const products = useProductOptions();
  const managers = useManagerOptions(isAdmin);

  const clientOptions = (clients.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.company_name ?? undefined,
  }));
  const managerOptions = (managers.data ?? []).map((m) => ({ value: m.id, label: m.full_name }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setLocalError("Выберите клиента");
      return;
    }
    if (!headerOnly) {
      const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0);
      if (validItems.length === 0) {
        setLocalError("Добавьте хотя бы одну позицию с товаром и количеством");
        return;
      }
      setLocalError(null);
      onSubmit({ client_id: clientId, deadline, comment, manager_id: managerId, items: validItems });
      return;
    }
    setLocalError(null);
    onSubmit({ client_id: clientId, deadline, comment, manager_id: managerId, items });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Клиент</label>
          <Combobox
            value={clientId || null}
            onChange={(v) => setClientId(v ?? "")}
            options={clientOptions}
            placeholder={clients.isLoading ? "Загрузка…" : "Выбрать клиента"}
            allowClear={false}
          />
        </div>
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Срок (необязательно)</label>
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
          />
        </div>

        {isAdmin && (
          <div>
            <label className="mb-1.5 block text-[13px] font-semibold text-text">
              Менеджер (необязательно)
            </label>
            <Combobox
              value={managerId}
              onChange={setManagerId}
              options={managerOptions}
              placeholder={managers.isLoading ? "Загрузка…" : "По умолчанию — вы"}
            />
          </div>
        )}

        <div className={isAdmin ? "" : "sm:col-span-2"}>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">
            Комментарий (необязательно)
          </label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {headerOnly ? (
        <p className="rounded-lg bg-black/[0.03] px-3 py-2 text-[12.5px] text-muted">
          Состав заказа уже списан со склада и не меняется. Чтобы изменить позиции — удалите
          заказ (товар вернётся на склад) и создайте новый.
        </p>
      ) : (
        <div>
          <label className="mb-1.5 block text-[13px] font-semibold text-text">Позиции заказа</label>
          <OrderItemsEditor items={items} onChange={setItems} products={products.data ?? []} />
        </div>
      )}

      {(localError || error) && (
        <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">
          {localError || error}
        </p>
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
