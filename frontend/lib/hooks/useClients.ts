import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createClient,
  deleteClient,
  getClient,
  getClientsOverview,
  getClientStats,
  listClients,
  updateClient,
  type ListClientsParams,
} from "@/lib/api/clients";
import type { ClientCreate, ClientUpdate } from "@/lib/types/client";

/** Все клиенты в зоне видимости + агрегаты (сделки, оборот, долг, статус) — для таблицы /clients. */
export function useClientsOverview() {
  return useQuery({
    queryKey: ["clients-overview"],
    queryFn: () => getClientsOverview().then((r) => r.data.rows),
  });
}

export function useClient(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClient(clientId!).then((r) => r.data),
    enabled: !!clientId,
  });
}

/** Сводная статистика по клиенту — долг, суммы и крайние даты отгрузок/оплат. */
export function useClientStats(clientId: string | undefined) {
  return useQuery({
    queryKey: ["client-stats", clientId],
    queryFn: () => getClientStats(clientId!).then((r) => r.data),
    enabled: !!clientId,
  });
}

/** Справочник клиентов для выпадающих списков — уже скоупится по менеджеру на стороне backend для SaM. */
export function useClientOptions() {
  return useQuery({
    queryKey: ["client-options"],
    queryFn: () => listClients({ size: 1000 }).then((r) => r.data.items),
    staleTime: 60_000,
  });
}

export function useClientsList(params: ListClientsParams) {
  return useQuery({
    queryKey: ["clients", params],
    queryFn: () => listClients(params).then((r) => r.data),
  });
}

function useInvalidateClients() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["clients"] });
    qc.invalidateQueries({ queryKey: ["client-options"] });
    qc.invalidateQueries({ queryKey: ["clients-overview"] });
  };
}

export function useCreateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (data: ClientCreate) => createClient(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ClientUpdate }) =>
      updateClient(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (id: string) => deleteClient(id).then((r) => r.data),
    onSuccess: invalidate,
  });
}
