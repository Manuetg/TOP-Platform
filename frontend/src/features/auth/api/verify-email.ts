import { apiRequest } from "../../../shared/api/api-client";
export function verifyEmail(token: string): Promise<{ status: "EMAIL_VERIFIED" }> { return apiRequest<{ status: "EMAIL_VERIFIED" }>("/auth/verify-email", { method: "POST", body: JSON.stringify({ token }) }); }
