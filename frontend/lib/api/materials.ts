import { http } from "@/lib/api/http";
import type { Message, Page, PageParams } from "@/lib/types/common";
import type { MaterialCreate, MaterialRead, MaterialUpdate } from "@/lib/types/material";

export interface ListMaterialsParams extends Partial<PageParams> {
  search?: string;
  category?: string;
  is_active?: boolean;
}

export const listMaterials = (params: ListMaterialsParams = {}) =>
  http.get<Page<MaterialRead>>("/materials", { params });

export const createMaterial = (data: MaterialCreate) =>
  http.post<MaterialRead>("/materials", data);

export const getMaterial = (materialId: string) =>
  http.get<MaterialRead>(`/materials/${materialId}`);

export const updateMaterial = (materialId: string, data: MaterialUpdate) =>
  http.patch<MaterialRead>(`/materials/${materialId}`, data);

export const deleteMaterial = (materialId: string) => http.delete<Message>(`/materials/${materialId}`);
