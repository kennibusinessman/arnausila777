/** Зеркало backend/app/schemas/payment.py */
import type { PaymentMethod } from "./enums";

export interface PaymentCreate {
  client_id: string;
  order_id?: string | null;
  payment_date: string;
  amount: string;
  payment_method: PaymentMethod;
  comment?: string | null;
}

export interface PaymentUpdate {
  order_id?: string | null;
  payment_date?: string | null;
  amount?: string | null;
  payment_method?: PaymentMethod | null;
  comment?: string | null;
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

export interface PaymentRead {
  id: string;
  client_id: string;
  order_id: string | null;
  payment_date: string;
  amount: string;
  payment_method: PaymentMethod;
  comment: string | null;
  created_by: string;
  created_at: string;
  client?: ClientBrief | null;
  order?: OrderBrief | null;
}

export interface PaymentSummary {
  count: number;
  total_amount: string;
  average: string;
  client_count: number;
}
