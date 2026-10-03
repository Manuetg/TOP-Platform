import { apiRequest, ApiResponseError } from "../../../shared/api/api-client";
import type { Business } from "../types/business.types";

export type BusinessUpdate = Pick<Business, "name" | "legalName" | "taxId" | "timezone" | "country" | "region" | "city" | "address"> & { expectedUpdatedAt: string };

function profile(value: Business, id: string): Business {
  if (!value || value.id !== id || typeof value.name !== "string" ||
      (value.legalName !== null && typeof value.legalName !== "string") ||
      (value.taxId !== null && typeof value.taxId !== "string") ||
      [value.country, value.region, value.city, value.address].some((field) => field != null && typeof field !== "string") ||
      typeof value.timezone !== "string" || typeof value.currency !== "string" ||
      !["ACTIVE", "SUSPENDED", "ARCHIVED"].includes(value.status) ||
      typeof value.createdAt !== "string" || typeof value.updatedAt !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) ||
      !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) throw new ApiResponseError();
  return { ...value, country: value.country ?? null, region: value.region ?? null, city: value.city ?? null, address: value.address ?? null };
}

export async function getBusiness(id: string, accessToken: string, signal?: AbortSignal): Promise<Business> {
  return profile(await apiRequest<Business>(`/businesses/${encodeURIComponent(id)}`, { accessToken, signal }), id);
}
export async function updateBusiness(id: string, changes: BusinessUpdate, accessToken: string, signal: AbortSignal): Promise<Business> {
  const { name, legalName, taxId, timezone, country, region, city, address, expectedUpdatedAt } = changes;
  return profile(await apiRequest<Business>(`/businesses/${encodeURIComponent(id)}`, {
    method: "PATCH", body: JSON.stringify({ name, legalName, taxId, timezone, country, region, city, address, expectedUpdatedAt }), accessToken, signal, skipUnauthorizedRecovery: true,
  }), id);
}
