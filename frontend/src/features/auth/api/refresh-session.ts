import { apiRequest } from "../../../shared/api/api-client";

export interface RefreshSessionResponse { accessToken: string; refreshToken: string; tokenType: "Bearer"; expiresIn: number; }
export function refreshSession(refreshToken: string): Promise<RefreshSessionResponse> {
  return apiRequest<RefreshSessionResponse>("/auth/refresh", { method: "POST", body: JSON.stringify({ refreshToken }) });
}
