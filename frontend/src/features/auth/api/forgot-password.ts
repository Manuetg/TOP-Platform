import { apiRequest } from "../../../shared/api/api-client";
export interface ForgotPasswordResponse { message: string; challengeId: string; }
export function forgotPassword(email: string): Promise<ForgotPasswordResponse> { return apiRequest<ForgotPasswordResponse>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }); }
