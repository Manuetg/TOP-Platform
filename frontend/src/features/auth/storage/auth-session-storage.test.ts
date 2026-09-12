import { afterEach, describe, expect, it } from "vitest";
import { AUTH_SESSION_STORAGE_KEY, clearPersistedAuthSession, readPersistedAuthSession, writePersistedAuthSession } from "./auth-session-storage";

const session = { accessToken: "a", refreshToken: "r", tokenType: "Bearer" as const, expiresIn: 900, user: { id: "u", email: "u@top.local", status: "ACTIVE" as const }, memberships: [{ businessId: "b", role: "OWNER" as const }] };
afterEach(() => sessionStorage.clear());
describe("auth session storage", () => {
  it("writes and reads only the restorable snapshot", () => { writePersistedAuthSession(session); expect(readPersistedAuthSession()).toEqual({ refreshToken: "r", user: session.user, memberships: session.memberships }); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).not.toContain("accessToken"); });
  it("clears malformed JSON and invalid shapes", () => { sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, "{"); expect(readPersistedAuthSession()).toBeNull(); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); sessionStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify({ refreshToken: "" })); expect(readPersistedAuthSession()).toBeNull(); });
  it("clears explicitly", () => { writePersistedAuthSession(session); clearPersistedAuthSession(); expect(readPersistedAuthSession()).toBeNull(); });
});
