"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Combobox } from "@/components/ui/Combobox";
import { Modal } from "@/components/ui/Modal";
import { OrderItemsEditor } from "@/components/orders/OrderItemsEditor";
import { useAuthStore } from "@/lib/auth/store";
import { useClientOptions } from "@/lib/hooks/useClients";
import { useCreateOrder } from "@/lib/hooks/useOrders";
import { useProductOptions } from "@/lib/hooks/useProducts";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import type { OrderItemCreate } from "@/lib/types/order";

interface CreateOrderModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (orderId: string) => void;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Новый заказ = факт продажи: при создании backend сразу списывает остаток со
 * склада готовой продукции и наращивает долг клиента. Если товара не хватает —
 * заказ не создаётся, а в ошибке указано, какого именно товара и сколько мало.
 */
export function CreateOrderModal({ open, onClose, onCreated }: CreateOrderModalProps) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [items, setItems] = useState<OrderItemCreate[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);

  const role = useAuthStore((s) => s.user?.role);
  const hideMoney = role === UserRole.WAREHOUSE_MANAGER;

  const clients = useClientOptions();
  const products = useProductOptions();
  const createOrder = useCreateOrder();

  const clientOptions = (clients.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.company_name ?? undefined,
  }));

  function reset() {
    setClientId(null);
    setDate(today());
    setItems([]);
    setComment("");
    setError(null);
  }

  function handleClose() {
    if (createOrder.isPending) return;
    reset();
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) {
      setError("Выберите клиента");
      return;
    }
    const validItems = items.filter((i) => i.product_id && Number(i.quantity) > 0);
    if (validItems.length === 0) {
      setError("Добавьте хотя бы один товар");
      return;
    }
    setError(null);
    createOrder.mutate(
      { client_id: clientId, deadline: date, comment: comment || null, items: validItems },
      {
        onSuccess: (order) => {
          const orderId = order.id;
          reset();
          onClose();
          onCreated(orderId);
        },
        onError: (err) => setError(apiErrorMessage(err, "Не удалось создать заказ")),
      }
    );
  }

  return (
    <Modal open={open} title="Новый заказ" onClose={handleClose}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Номер заказа</label>
            <input
              type="text"
              value="Будет создан автоматически"
              disabled
              className="w-full rounded-xl border-[1.5px] border-border bg-black/[0.03] outline-none px-3 py-2 text-sm text-muted"
            />
          </div>
          <div>
            <label className="mb-1 block text-[13px] font-semibold text-text">Дата</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={createOrder.isPending}
              className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">Клиент</label>
          <Combobox
            value={clientId}
            onChange={setClientId}
            options={clientOptions}
            placeholder={clients.isLoading ? "Загрузка…" : "Найти клиента по имени…"}
            disabled={createOrder.isPending}
            allowClear={false}
          />
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">Наименование</label>
          <OrderItemsEditor
            items={items}
            onChange={setItems}
            products={products.data ?? []}
            disabled={createOrder.isPending}
            hidePrice={hideMoney}
          />
        </div>

        <div>
          <label className="mb-1 block text-[13px] font-semibold text-text">
            Комментарий (необязательно)
          </label>
          <input
            type="text"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={createOrder.isPending}
            className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" disabled={createOrder.isPending}>
            {createOrder.isPending ? "Создание…" : "Создать заказ"}
          </Button>
          <Button type="button" variant="secondary" onClick={handleClose} disabled={createOrder.isPending}>
            Отмена
          </Button>
        </div>
      </form>
    </Modal>
  );
}
