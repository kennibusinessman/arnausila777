"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Spinner } from "@/components/ui/Spinner";
import { OrderForm, type OrderFormValues } from "@/components/orders/OrderForm";
import { useAuthStore } from "@/lib/auth/store";
import { useDeleteOrder, useOrder, usePriceOrder, useUpdateOrder } from "@/lib/hooks/useOrders";
import { useShipmentsList } from "@/lib/hooks/useShipments";
import { apiErrorMessage } from "@/lib/api/http";
import { UserRole } from "@/lib/types/enums";
import type { OrderItemRead, OrderRead } from "@/lib/types/order";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/utils/format";

/** Колонки позиций: зав. складом денег не видит — без «Цена»/«Сумма». */
function itemColumnsFor(hideMoney: boolean): DataTableColumn<OrderItemRead>[] {
  return [
    {
      header: "Товар",
      cell: (row) => (
        <div className="flex flex-col">
          <span>{row.product?.name ?? row.product_id}</span>
          {row.product?.sku && <span className="text-xs text-muted">{row.product.sku}</span>}
        </div>
      ),
    },
    {
      header: "Кол-во",
      align: "right",
      cell: (row) => `${row.quantity} ${row.product?.unit ?? ""}`,
    },
    ...(hideMoney
      ? []
      : [
          { header: "Цена", align: "right" as const, cell: (row: OrderItemRead) => formatCurrency(row.unit_price) },
          { header: "Сумма", align: "right" as const, cell: (row: OrderItemRead) => formatCurrency(row.total_price) },
        ]),
    { header: "Комментарий", cell: (row) => row.comment ?? "—" },
  ];
}

/** Отгрузка создаётся автоматически вместе с заказом — здесь только показываем её (без действий). */
function ShipmentSection({ order }: { order: OrderRead }) {
  const { data: shipments, isLoading } = useShipmentsList({ order_id: order.id, size: 5 });
  const shipment = shipments?.items[0];

  return (
    <Card title="Отгрузка">
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : shipment ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-semibold text-text">{shipment.shipment_number}</span>
            <div className="mt-0.5 text-xs text-muted">
              Списано со склада {formatDate(shipment.shipment_date)} · {formatCurrency(shipment.total_amount)}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted">Отгрузка по заказу не найдена.</p>
      )}
    </Card>
  );
}

/** Доценка: менеджер/руководитель проставляют цены позиций заказа без цен (создан зав. складом). */
function PricingCard({ order }: { order: OrderRead }) {
  const priceOrder = usePriceOrder(order.id);
  const [prices, setPrices] = useState<Record<string, string>>(() =>
    Object.fromEntries(order.items.map((it) => [it.id, Number(it.unit_price) ? it.unit_price : ""]))
  );
  const [error, setError] = useState<string | null>(null);

  const total = order.items.reduce(
    (sum, it) => sum + (Number(prices[it.id]) || 0) * (Number(it.quantity) || 0),
    0
  );

  function handleSave() {
    setError(null);
    priceOrder.mutate(
      { items: order.items.map((it) => ({ id: it.id, unit_price: prices[it.id] || "0" })) },
      { onError: (err) => setError(apiErrorMessage(err, "Не удалось сохранить цены")) }
    );
  }

  return (
    <Card title="Доценка заказа">
      <p className="mb-3 text-[13px] text-muted">
        Заказ заведён без цен. Проставьте цену каждой позиции — сумма заказа и отгрузки
        пересчитаются автоматически.
      </p>
      <div className="flex flex-col gap-2">
        {order.items.map((it) => (
          <div key={it.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-white/50 p-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-medium text-text">
                {it.product?.name ?? it.product_id}
              </div>
              <div className="text-xs text-muted">
                {it.quantity} {it.product?.unit ?? ""}
              </div>
            </div>
            <div className="w-32">
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Цена, ₸"
                value={prices[it.id] ?? ""}
                onChange={(e) => setPrices((p) => ({ ...p, [it.id]: e.target.value }))}
                className="w-full rounded-xl border-[1.5px] border-border bg-white/80 outline-none focus:border-primary/50 px-2.5 py-1.5 text-sm"
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[13.5px] font-semibold text-text">Итого: {formatCurrency(total)}</span>
        <Button size="sm" onClick={handleSave} disabled={priceOrder.isPending}>
          {priceOrder.isPending ? "Сохранение…" : "Сохранить цены"}
        </Button>
      </div>
      {error && <p className="mt-2 rounded-lg bg-danger-bg px-3 py-2 text-[13px] text-danger">{error}</p>}
    </Card>
  );
}

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const router = useRouter();
  const role = useAuthStore((s) => s.user?.role);
  const isAdmin = role === UserRole.SUPER_ADMIN || role === UserRole.BOSS;
  // Зав. складом денег не видит. Доценивать может менеджер по продажам и руководство.
  const hideMoney = role === UserRole.WAREHOUSE_MANAGER;
  const canPrice = isAdmin || role === UserRole.SALES_MANAGER;
  const itemColumns = itemColumnsFor(hideMoney);

  const { data: order, isLoading, isError, error } = useOrder(orderId);
  const updateOrder = useUpdateOrder(orderId);
  const deleteOrder = useDeleteOrder();

  const [editing, setEditing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner />
      </div>
    );
  }

  if (isError || !order) {
    return (
      <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">
        {apiErrorMessage(error, "Заказ не найден")}
      </p>
    );
  }

  function handleEditSubmit(values: OrderFormValues) {
    setActionError(null);
    // Правим только шапку — состав уже списан со склада и не меняется.
    updateOrder.mutate(
      {
        client_id: values.client_id,
        deadline: values.deadline || null,
        comment: values.comment || null,
        manager_id: values.manager_id,
      },
      {
        onSuccess: () => setEditing(false),
        onError: (err) => setActionError(apiErrorMessage(err, "Не удалось сохранить заказ")),
      }
    );
  }

  function handleDelete() {
    if (!order) return;
    if (!window.confirm(`Удалить заказ ${order.order_number}? Товар вернётся на склад.`)) return;
    deleteOrder.mutate(order.id, {
      onSuccess: () => router.push("/orders"),
      onError: (err) => setActionError(apiErrorMessage(err, "Не удалось удалить заказ")),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Link href="/orders" className="text-sm text-muted hover:text-text">
          ‹ К списку заказов
        </Link>
      </div>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-text">{order.order_number}</h2>
            <p className="mt-1 text-[13px] text-muted">Создан {formatDateTime(order.created_at)}</p>
          </div>
          {!hideMoney && (
            <div className="text-right">
              <div className="text-xs font-semibold text-muted">Сумма заказа</div>
              <div className="text-2xl font-bold text-text">{formatCurrency(order.total_amount)}</div>
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
          <div>
            <div className="text-xs font-semibold text-muted">Клиент</div>
            <div>{order.client?.name ?? "—"}</div>
            {order.client?.company_name && (
              <div className="text-xs text-muted">{order.client.company_name}</div>
            )}
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Менеджер</div>
            <div>{order.manager?.full_name ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs font-semibold text-muted">Срок</div>
            <div>{formatDate(order.deadline)}</div>
          </div>
        </div>
        {order.comment && (
          <div className="mt-3 text-sm">
            <div className="text-xs font-semibold text-muted">Комментарий</div>
            <div>{order.comment}</div>
          </div>
        )}
      </Card>

      {actionError && (
        <p className="rounded-lg bg-danger-bg px-3.5 py-2.5 text-sm text-danger">{actionError}</p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {!editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Редактировать
          </Button>
        )}
        {isAdmin && (
          <Button
            variant="secondary"
            size="sm"
            onClick={handleDelete}
            disabled={deleteOrder.isPending}
            className="ml-auto text-danger hover:bg-danger-bg"
          >
            Удалить заказ
          </Button>
        )}
      </div>

      {!hideMoney && <ShipmentSection order={order} />}

      {canPrice && !editing && Number(order.total_amount) === 0 && <PricingCard order={order} />}

      {editing ? (
        <Card title="Редактирование заказа">
          <OrderForm
            initial={{
              client_id: order.client_id,
              deadline: order.deadline ?? "",
              comment: order.comment ?? "",
              manager_id: order.manager_id,
              items: order.items.map((item) => ({
                product_id: item.product_id,
                quantity: item.quantity,
                unit_price: item.unit_price,
                comment: item.comment ?? undefined,
              })),
            }}
            isAdmin={isAdmin}
            headerOnly
            submitLabel="Сохранить изменения"
            submitting={updateOrder.isPending}
            onSubmit={handleEditSubmit}
            onCancel={() => setEditing(false)}
          />
        </Card>
      ) : (
        <DataTable columns={itemColumns} rows={order.items} keyField={(row) => row.id} />
      )}
    </div>
  );
}
