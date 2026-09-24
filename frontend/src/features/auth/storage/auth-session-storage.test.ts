import { afterEach, describe, expect, it } from "vitest";
import { AUTH_SESSION_STORAGE_KEY, clearPersistedAuthSession, readPersistedAuthSession, writePersistedAuthSession } from "./auth-session-storage";

const session = { accessToken: "a", refreshToken: "r", tokenType: "Bearer" as const, expiresIn: 900, user: { id: "u", email: "u@top.local", status: "ACTIVE" as const }, memberships: [{ businessId: "b", role: "OWNER" as const }] };
afterEach(() => { sessionStorage.clear(); localStorage.clear(); });
describe("auth session storage", () => {
  it("uses sessionStorage by default", () => { writePersistedAuthSession(session); expect(readPersistedAuthSession()).toEqual({ refreshToken: "r", user: session.user, memberships: session.memberships, mode: "SESSION" }); expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toContain("accessToken"); });
  it("uses localStorage for persistent sessions", () => { writePersistedAuthSession(session, "PERSISTENT"); expect(readPersistedAuthSession()).toEqual({ refreshToken: "r", user: session.user, memberships: session.memberships, mode: "PERSISTENT" }); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); });
  it("switches mode without leaving a conflicting snapshot", () => { writePersistedAuthSession(session, "PERSISTENT"); writePersistedAuthSession(session, "SESSION"); expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); expect(readPersistedAuthSession()?.mode).toBe("SESSION"); });
  it("clears malformed JSON and invalid shapes", () => { sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, "{"); expect(readPersistedAuthSession()).toBeNull(); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ refreshToken: "" })); expect(readPersistedAuthSession()).toBeNull(); });
  it("clears both storage modes explicitly", () => { writePersistedAuthSession(session, "PERSISTENT"); writePersistedAuthSession(session, "SESSION"); clearPersistedAuthSession(); expect(readPersistedAuthSession()).toBeNull(); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); });
});
