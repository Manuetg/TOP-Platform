import { apiRequest } from "../../../shared/api/api-client";
export interface VerifyResetCodeResponse { resetGrant: string; }
export function verifyResetCode(challengeId: string, code: string): Promise<VerifyResetCodeResponse> { return apiRequest<VerifyResetCodeResponse>("/auth/verify-reset-code", { method: "POST", body: JSON.stringify({ challengeId, code }) }); }
