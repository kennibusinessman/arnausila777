import { useQuery } from "@tanstack/react-query";
import { getShipment, listShipments, type ListShipmentsParams } from "@/lib/api/shipments";

// Отгрузки только на чтение — создаются и отменяются вместе с заказом (см. useOrders).
export function useShipmentsList(params: ListShipmentsParams) {
  return useQuery({
    queryKey: ["shipments", params],
    queryFn: () => listShipments(params).then((r) => r.data),
  });
}

export function useShipment(shipmentId: string | undefined) {
  return useQuery({
    queryKey: ["shipment", shipmentId],
    queryFn: () => getShipment(shipmentId!).then((r) => r.data),
    enabled: !!shipmentId,
  });
}
