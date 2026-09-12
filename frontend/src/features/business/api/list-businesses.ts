import { apiRequest } from "../../../shared/api/api-client";
import type { Business } from "../types/business.types";
export function listBusinesses(accessToken: string) { return apiRequest<Business[]>("/businesses", { accessToken }); }
