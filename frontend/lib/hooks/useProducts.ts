import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createProduct,
  deleteProduct,
  getCatalog,
  listProducts,
  updateProduct,
  type ListProductsParams,
} from "@/lib/api/products";
import type { ProductCreate, ProductUpdate } from "@/lib/types/product";

export function useProductOptions() {
  return useQuery({
    queryKey: ["product-options"],
    queryFn: () => listProducts({ size: 100, is_active: true }).then((r) => r.data.items),
    staleTime: 60_000,
  });
}

/** Единый каталог «Товары»: продукция + сырьё с остатками одним запросом. */
export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: () => getCatalog().then((r) => r.data.items),
  });
}

export function useProductsList(params: ListProductsParams) {
  return useQuery({
    queryKey: ["products", params],
    queryFn: () => listProducts(params).then((r) => r.data),
  });
}

function useInvalidateProducts() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["product-options"] });
    qc.invalidateQueries({ queryKey: ["catalog"] });
  };
}

export function useCreateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (data: ProductCreate) => createProduct(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ProductUpdate }) =>
      updateProduct(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteProduct() {
  const invalidate = useInvalidateProducts();
  return useMutation({
    mutationFn: (id: string) => deleteProduct(id).then((r) => r.data),
    onSuccess: invalidate,
  });
}
