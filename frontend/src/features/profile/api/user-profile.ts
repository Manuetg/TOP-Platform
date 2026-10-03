import { apiRequest, ApiResponseError } from "../../../shared/api/api-client";

export const PROFILE_AVATAR_IDS = ["user", "leaf", "sun", "mountain"] as const;
export type ProfileAvatarId = typeof PROFILE_AVATAR_IDS[number];

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  birthYear: number | null;
  username: string | null;
  phone: string | null;
  avatarId: ProfileAvatarId | null;
  status: "ACTIVE" | "DISABLED";
  updatedAt: string;
}

export interface UpdateUserProfile {
  displayName: string;
  birthYear?: number | null;
  username?: string | null;
  phone?: string | null;
  avatarId?: ProfileAvatarId | null;
  expectedUpdatedAt: string;
}

function profile(value: UserProfile, userId: string): UserProfile {
  if (!value || value.id !== userId || typeof value.email !== "string" ||
      (value.displayName !== null && typeof value.displayName !== "string") ||
      (value.birthYear != null && !Number.isInteger(value.birthYear)) ||
      (value.username != null && typeof value.username !== "string") ||
      (value.phone != null && typeof value.phone !== "string") ||
      (value.avatarId != null && !PROFILE_AVATAR_IDS.includes(value.avatarId)) ||
      !["ACTIVE", "DISABLED"].includes(value.status) ||
      typeof value.updatedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.updatedAt) ||
      !Number.isFinite(Date.parse(value.updatedAt)) || new Date(value.updatedAt).toISOString() !== value.updatedAt) throw new ApiResponseError();
  return { ...value, birthYear: value.birthYear ?? null, username: value.username ?? null, phone: value.phone ?? null, avatarId: value.avatarId ?? null };
}

export async function updateUserProfile(userId: string, changes: UpdateUserProfile, accessToken: string, signal: AbortSignal): Promise<UserProfile> {
  const { displayName, birthYear, username, phone, avatarId, expectedUpdatedAt } = changes;
  return profile(await apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}/profile`, {
    method: "PATCH", body: JSON.stringify({ displayName, birthYear, username, phone, avatarId, expectedUpdatedAt }), accessToken, signal, skipUnauthorizedRecovery: true,
  }), userId);
}

export async function getUserProfile(userId: string, accessToken: string, signal?: AbortSignal): Promise<UserProfile> {
  return profile(await apiRequest<UserProfile>(`/users/${encodeURIComponent(userId)}/profile`, { accessToken, signal }), userId);
}
