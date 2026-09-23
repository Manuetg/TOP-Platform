import { apiRequest } from "../../../shared/api/api-client";
import type { Business } from "../types/business.types";

export type BusinessUpdate = Pick<Business, "name" | "legalName" | "taxId" | "timezone">;
export function getBusiness(id: string, accessToken: string, signal?: AbortSignal) {
  return apiRequest<Business>(`/businesses/${id}`, { accessToken, signal });
}
export function updateBusiness(id: string, changes: BusinessUpdate, accessToken: string, signal: AbortSignal) {
  return apiRequest<Business>(`/businesses/${id}`, { method: "PATCH", body: JSON.stringify(changes), accessToken, signal });
}
