import type { AuthMembership, AuthUser, LoginResponse } from "../types/auth.types";

export const AUTH_SESSION_STORAGE_KEY = "top.auth.session.v1";
export type AuthPersistenceMode = "SESSION" | "PERSISTENT";
export interface PersistedAuthSession { refreshToken: string; user: AuthUser; memberships: AuthMembership[]; mode: AuthPersistenceMode; }

const storageFor = (mode: AuthPersistenceMode): Storage => mode === "PERSISTENT" ? localStorage : sessionStorage;

function isSnapshot(value: unknown): value is PersistedAuthSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistedAuthSession>;
  return typeof item.refreshToken === "string" && item.refreshToken.length > 0 &&
    !!item.user && typeof item.user.id === "string" && typeof item.user.email === "string" &&
    (item.user.status === "ACTIVE" || item.user.status === "DISABLED") &&
    (item.mode === undefined || item.mode === "SESSION" || item.mode === "PERSISTENT") && Array.isArray(item.memberships) &&
    item.memberships.every((m) => !!m && typeof m.businessId === "string" && ["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"].includes(m.role));
}

export function readPersistedAuthSession(): PersistedAuthSession | null {
  try {
    for (const mode of ["PERSISTENT", "SESSION"] as const) {
      const storage = storageFor(mode);
      const raw = storage.getItem(AUTH_SESSION_STORAGE_KEY);
      if (!raw) continue;
      const value: unknown = JSON.parse(raw);
      if (!isSnapshot(value)) { clearPersistedAuthSession(); return null; }
      return { ...value, mode: value.mode ?? mode };
    }
    return null;
  } catch { clearPersistedAuthSession(); return null; }
}
export function writePersistedAuthSession(session: LoginResponse | PersistedAuthSession, mode: AuthPersistenceMode = "SESSION"): void {
  try {
    const snapshot = JSON.stringify({ refreshToken: session.refreshToken, user: session.user, memberships: session.memberships, mode });
    const target = storageFor(mode);
    const other = storageFor(mode === "PERSISTENT" ? "SESSION" : "PERSISTENT");
    other.removeItem(AUTH_SESSION_STORAGE_KEY);
    target.setItem(AUTH_SESSION_STORAGE_KEY, snapshot);
  } catch { /* fail closed */ }
}
export function clearPersistedAuthSession(): void {
  try { sessionStorage.removeItem(AUTH_SESSION_STORAGE_KEY); } catch { /* fail closed */ }
  try { localStorage.removeItem(AUTH_SESSION_STORAGE_KEY); } catch { /* fail closed */ }
}
