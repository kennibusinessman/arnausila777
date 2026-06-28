import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type {
  CatalogResponse,
  ProductCreate,
  ProductRead,
  ProductUpdate,
} from "@/lib/types/product";

export interface ListProductsParams extends Partial<PageParams> {
  search?: string;
  category?: string;
  subcategory?: string;
  is_active?: boolean;
}

export const listProducts = (params: ListProductsParams = {}) =>
  http.get<Page<ProductRead>>("/products", { params });

/** Единый каталог: продукция + сырьё с остатками (страница «Товары»). */
export const getCatalog = () => http.get<CatalogResponse>("/products/catalog");

export const createProduct = (data: ProductCreate) => http.post<ProductRead>("/products", data);

export const getProduct = (productId: string) => http.get<ProductRead>(`/products/${productId}`);

export const updateProduct = (productId: string, data: ProductUpdate) =>
  http.patch<ProductRead>(`/products/${productId}`, data);

export const deleteProduct = (productId: string) => http.delete<Message>(`/products/${productId}`);
