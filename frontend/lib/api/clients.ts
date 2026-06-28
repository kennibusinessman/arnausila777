import { http } from "@/lib/api/http";
import type {
  ClientCreate,
  ClientOverviewResponse,
  ClientRead,
  ClientStats,
  ClientUpdate,
} from "@/lib/types/client";
import type { Message, Page, PageParams } from "@/lib/types/common";

export interface ListClientsParams extends Partial<PageParams> {
  search?: string;
  manager_id?: string;
}

export const listClients = (params: ListClientsParams = {}) =>
  http.get<Page<ClientRead>>("/clients", { params });

export const createClient = (data: ClientCreate) => http.post<ClientRead>("/clients", data);

export const getClient = (clientId: string) => http.get<ClientRead>(`/clients/${clientId}`);

export const getClientStats = (clientId: string) =>
  http.get<ClientStats>(`/clients/${clientId}/stats`);

export const getClientsOverview = (search?: string) =>
  http.get<ClientOverviewResponse>("/clients/overview", {
    params: search ? { search } : {},
  });

export const updateClient = (clientId: string, data: ClientUpdate) =>
  http.patch<ClientRead>(`/clients/${clientId}`, data);

export const deleteClient = (clientId: string) => http.delete<Message>(`/clients/${clientId}`);
