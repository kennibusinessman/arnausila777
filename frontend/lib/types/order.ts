/** Зеркало backend/app/schemas/order.py */

export interface OrderItemCreate {
  product_id: string;
  quantity: string;
  unit_price?: string | null;
  comment?: string | null;
}

export interface OrderCreate {
  client_id: string;
  deadline?: string | null;
  comment?: string | null;
  manager_id?: string | null;
  items: OrderItemCreate[];
}

export interface OrderUpdate {
  client_id?: string | null;
  deadline?: string | null;
  comment?: string | null;
  manager_id?: string | null;
}

export interface OrderItemPrice {
  id: string;
  unit_price: string;
}

/** Доценка заказа: проставить цены позиций заказа, созданного зав. складом без цен. */
export interface OrderPricing {
  items: OrderItemPrice[];
}

interface ProductBrief {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
  base_weight: string | null;
}

interface ClientBrief {
  id: string;
  name: string;
  company_name: string | null;
}

interface UserBrief {
  id: string;
  full_name: string;
}

export interface OrderItemRead {
  id: string;
  product_id: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  comment: string | null;
  product?: ProductBrief | null;
}

export interface OrderRead {
  id: string;
  order_number: string;
  client_id: string;
  manager_id: string | null;
  deadline: string | null;
  comment: string | null;
  total_amount: string;
  created_at: string;
  client?: ClientBrief | null;
  manager?: UserBrief | null;
  items: OrderItemRead[];
}

export interface OrderListItem {
  id: string;
  order_number: string;
  client_id: string;
  manager_id: string | null;
  deadline: string | null;
  total_amount: string;
  created_at: string;
  client?: ClientBrief | null;
  manager?: UserBrief | null;
  items: OrderItemRead[];
  total_weight: string;
  /** true → по заказу есть авто-расход себестоимости сырья. */
  has_expense: boolean;
}

export interface OrderSummary {
  count: number;
  total_amount: string;
  total_weight: string;
}
