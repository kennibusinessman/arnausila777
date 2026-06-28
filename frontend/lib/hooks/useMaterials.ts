import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaterial,
  deleteMaterial,
  listMaterials,
  updateMaterial,
  type ListMaterialsParams,
} from "@/lib/api/materials";
import type { MaterialCreate, MaterialUpdate } from "@/lib/types/material";

export function useMaterialOptions() {
  return useQuery({
    queryKey: ["material-options"],
    queryFn: () => listMaterials({ size: 100, is_active: true }).then((r) => r.data.items),
    staleTime: 60_000,
  });
}

export function useMaterialsList(params: ListMaterialsParams) {
  return useQuery({
    queryKey: ["materials", params],
    queryFn: () => listMaterials(params).then((r) => r.data),
  });
}

function useInvalidateMaterials() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["materials"] });
    qc.invalidateQueries({ queryKey: ["material-options"] });
    qc.invalidateQueries({ queryKey: ["catalog"] });
  };
}

export function useCreateMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: (data: MaterialCreate) => createMaterial(data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useUpdateMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: MaterialUpdate }) =>
      updateMaterial(id, data).then((r) => r.data),
    onSuccess: invalidate,
  });
}

export function useDeleteMaterial() {
  const invalidate = useInvalidateMaterials();
  return useMutation({
    mutationFn: (id: string) => deleteMaterial(id).then((r) => r.data),
    onSuccess: invalidate,
  });
}
