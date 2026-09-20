import { apiRequest } from "../../../shared/api/api-client";
import type { SearchResponse } from "../types";
export function searchBusiness(businessId: string, query: string, accessToken: string, signal: AbortSignal): Promise<SearchResponse> {
  return apiRequest<SearchResponse>(`/businesses/${businessId}/search?q=${encodeURIComponent(query)}`, { accessToken, signal });
}
