/** Зеркало backend/app/schemas/material.py */

export interface MaterialCreate {
  name: string;
  sku?: string | null;
  category?: string | null;
  unit: string;
  min_stock?: string;
  is_active?: boolean;
}

export interface MaterialUpdate {
  name?: string | null;
  sku?: string | null;
  category?: string | null;
  unit?: string | null;
  min_stock?: string | null;
  is_active?: boolean | null;
}

export interface MaterialRead {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  min_stock: string;
  is_active: boolean;
  created_at: string;
}
