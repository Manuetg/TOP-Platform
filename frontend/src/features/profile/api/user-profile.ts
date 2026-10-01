import { apiRequest, ApiResponseError } from "../../../shared/api/api-client";

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  status: "ACTIVE" | "DISABLED";
  updatedAt: string;
}

export interface UpdateUserProfile { displayName: string; reason: string; expectedUpdatedAt: string; }

function profile(value: UserProfile, userId: string): UserProfile {
  if (!value || value.id !== userId || typeof value.email !== "string" ||
      (value.displayName !== null && typeof value.displayName !== "string") ||
      !["ACTIVE", "DISABLED"].includes(value.status) ||
      typeof value.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) ||
      !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) throw new ApiResponseError();
  return value;
}

export async function updateUserProfile(userId: string, changes: UpdateUserProfile, accessToken: string, signal: AbortSignal): Promise<UserProfile> {
  const { displayName, reason, expectedUpdatedAt } = changes;
  return profile(await apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}/profile`, {
    method: "PATCH", body: JSON.stringify({ displayName, reason, expectedUpdatedAt }), accessToken, signal,
  }), userId);
}

export async function getUserProfile(userId: string, accessToken: string, signal?: AbortSignal): Promise<UserProfile> {
  return profile(await apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}/profile`, { accessToken, signal }), userId);
}
