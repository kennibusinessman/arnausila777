import { http } from "@/lib/api/http";
import type { Page, PageParams } from "@/lib/types/common";
import type { ShipmentListItem, ShipmentRead } from "@/lib/types/shipment";

// Отгрузки только на чтение — создаются/отменяются вместе с заказом (см. /orders).
export interface ListShipmentsParams extends Partial<PageParams> {
  order_id?: string;
  client_id?: string;
  date_from?: string;
  date_to?: string;
}

export const listShipments = (params: ListShipmentsParams = {}) =>
  http.get<Page<ShipmentListItem>>("/shipments", { params });

export const getShipment = (shipmentId: string) =>
  http.get<ShipmentRead>(`/shipments/${shipmentId}`);
