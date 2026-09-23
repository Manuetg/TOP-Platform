import { apiRequest } from "../../../shared/api/api-client";
import type { Business } from "../types/business.types";
export function listBusinesses(accessToken: string, signal?: AbortSignal) { return apiRequest<Business[]>("/businesses", { accessToken, signal }); }
