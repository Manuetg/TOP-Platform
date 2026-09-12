import { apiRequest } from "../../../shared/api/api-client";

export async function logout(refreshToken: string): Promise<void> {
  await apiRequest<void>("/auth/logout", { method: "POST", body: JSON.stringify({ refreshToken }) });
}
