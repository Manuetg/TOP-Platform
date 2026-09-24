import { apiRequest } from "../../../shared/api/api-client";
export interface SignupRequest { displayName: string; email: string; password: string; businessName: string; timezone: string; }
export interface SignupResponse { status: "EMAIL_VERIFICATION_REQUIRED"; email: string; }
export function signup(request: SignupRequest): Promise<SignupResponse> { return apiRequest<SignupResponse>("/auth/signup", { method: "POST", body: JSON.stringify(request) }); }
