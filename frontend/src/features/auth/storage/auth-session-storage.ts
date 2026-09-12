import type { AuthMembership, AuthUser, LoginResponse } from "../types/auth.types";

export const AUTH_SESSION_STORAGE_KEY = "top.auth.session.v1";
export interface PersistedAuthSession { refreshToken: string; user: AuthUser; memberships: AuthMembership[]; }

function isSnapshot(value: unknown): value is PersistedAuthSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistedAuthSession>;
  return typeof item.refreshToken === "string" && item.refreshToken.length > 0 &&
    !!item.user && typeof item.user.id === "string" && typeof item.user.email === "string" &&
    (item.user.status === "ACTIVE" || item.user.status === "DISABLED") && Array.isArray(item.memberships) &&
    item.memberships.every((m) => !!m && typeof m.businessId === "string" && ["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"].includes(m.role));
}

export function readPersistedAuthSession(): PersistedAuthSession | null {
  try { const raw = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY); if (!raw) return null; const value: unknown = JSON.parse(raw); if (!isSnapshot(value)) { clearPersistedAuthSession(); return null; } return value; } catch { clearPersistedAuthSession(); return null; }
}
export function writePersistedAuthSession(session: LoginResponse | PersistedAuthSession): void {
  try { sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ refreshToken: session.refreshToken, user: session.user, memberships: session.memberships })); } catch { /* fail closed */ }
}
export function clearPersistedAuthSession(): void { try { sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY); } catch { /* fail closed */ } }
