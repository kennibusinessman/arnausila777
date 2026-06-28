/** Зеркало backend/app/schemas/shipment.py (только чтение — отгрузка создаётся вместе с заказом). */

interface ProductBrief {
  id: string;
  name: string;
  sku: string | null;
  unit: string;
}

interface ClientBrief {
  id: string;
  name: string;
  company_name: string | null;
}

interface OrderBrief {
  id: string;
  order_number: string;
}

interface WarehouseBrief {
  id: string;
  name: string;
}

export interface ShipmentItemRead {
  id: string;
  product_id: string;
  quantity: string;
  unit_price: string;
  total_price: string;
  product?: ProductBrief | null;
}

export interface ShipmentRead {
  id: string;
  shipment_number: string;
  order_id: string;
  client_id: string;
  warehouse_id: string;
  shipment_date: string;
  total_amount: string;
  comment: string | null;
  created_at: string;
  order?: OrderBrief | null;
  client?: ClientBrief | null;
  warehouse?: WarehouseBrief | null;
  items: ShipmentItemRead[];
}

export interface ShipmentListItem {
  id: string;
  shipment_number: string;
  order_id: string;
  client_id: string;
  shipment_date: string;
  total_amount: string;
  created_at: string;
  order?: OrderBrief | null;
  client?: ClientBrief | null;
}
