import { apiRequest } from "../../../shared/api/api-client";
export interface ResetPasswordResponse { message: string; }
export function resetPassword(resetGrant: string, password: string): Promise<ResetPasswordResponse> { return apiRequest<ResetPasswordResponse>("/auth/reset-password", { method: "POST", body: JSON.stringify({ resetGrant, password }) }); }
