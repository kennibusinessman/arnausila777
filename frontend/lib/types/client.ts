/** Зеркало backend/app/schemas/client.py */

export interface ClientCreate {
  name: string;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  address?: string | null;
  comment?: string | null;
  manager_id?: string | null;
}

export interface ClientUpdate {
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  company_name?: string | null;
  address?: string | null;
  comment?: string | null;
  manager_id?: string | null;
}

export interface ClientRead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  company_name: string | null;
  address: string | null;
  comment: string | null;
  manager_id: string | null;
  created_at: string;
}

export interface ClientStats {
  client: ClientRead;
  total_shipped: string;
  total_paid: string;
  debt: string;
  order_count: number;
  shipment_count: number;
  payment_count: number;
  avg_payment: string;
  first_payment_date: string | null;
  last_payment_date: string | null;
  first_shipment_date: string | null;
  last_shipment_date: string | null;
}

export type ClientStatus = "active" | "lead" | "inactive";

export interface ClientOverviewRow {
  client: ClientRead;
  order_count: number;
  total_shipped: string;
  total_paid: string;
  debt: string;
  last_activity: string | null;
  status: ClientStatus;
}

export interface ClientOverviewResponse {
  rows: ClientOverviewRow[];
}
