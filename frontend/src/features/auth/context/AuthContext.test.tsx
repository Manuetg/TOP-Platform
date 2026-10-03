import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnauthorizedRecoveryHandler } from "../../../shared/api/api-client";
import type { LoginResponse } from "../types/auth.types";
import type { AuthPersistenceMode } from "../storage/auth-session-storage";
import { AuthProvider, useAuth } from "./AuthContext";

const dependencies = vi.hoisted(() => ({
  persisted: null as (LoginResponse & { mode?: AuthPersistenceMode }) | null,
  recovery: null as UnauthorizedRecoveryHandler | null,
  refresh: vi.fn(), revoke: vi.fn(), clear: vi.fn(), write: vi.fn(),
}));

vi.mock("../api/refresh-session", () => ({ refreshSession: dependencies.refresh }));
vi.mock("../api/logout", () => ({ logout: dependencies.revoke }));
vi.mock("../storage/auth-session-storage", () => ({
  readPersistedAuthSession: () => dependencies.persisted,
  writePersistedAuthSession: (value: LoginResponse, mode: AuthPersistenceMode) => { dependencies.persisted = { ...value, mode }; dependencies.write(value, mode); },
  clearPersistedAuthSession: () => { dependencies.persisted = null; dependencies.clear(); },
}));
vi.mock("../../../shared/api/api-client", () => ({
  configureUnauthorizedRecovery: (handler: UnauthorizedRecoveryHandler | null) => { dependencies.recovery = handler; },
}));

const makeSession = (refreshToken = "refresh-current", accessToken = "access-current"): LoginResponse => ({
  accessToken, refreshToken, tokenType: "Bearer", expiresIn: 900,
  user: { id: "user-1", email: "jeni@example.com", status: "ACTIVE" },
  memberships: [{ businessId: "business-1", role: "OWNER" }],
});

let observedAuth: ReturnType<typeof useAuth> | null = null;
function currentAuth() {
  if (!observedAuth) throw new Error("AuthProvider has not rendered");
  return observedAuth;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((finish, fail) => { resolve = finish; reject = fail; });
  return { promise, resolve, reject };
}
type Tokens = Omit<LoginResponse, "user" | "memberships">;
const rotatedTokens = (suffix: string): Tokens => ({ accessToken: `access-${suffix}`, refreshToken: `refresh-${suffix}`, tokenType: "Bearer", expiresIn: 900 });

function AuthConsumer() {
  const auth = useAuth();
  observedAuth = auth;
  return <>
    <output>{JSON.stringify({ status: auth.status, token: auth.session?.refreshToken ?? null, loggingOut: auth.isLoggingOut })}</output>
    <button onClick={() => auth.establishSession(makeSession())}>establish</button>
    <button onClick={() => { void auth.logout(); }}>logout</button>
    <button onClick={() => { void Promise.all([auth.logout(), auth.logout()]); }}>logout twice</button>
  </>;
}

function show() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(<QueryClientProvider client={queryClient}><AuthProvider><AuthConsumer /></AuthProvider></QueryClientProvider>);
  return { ...view, queryClient };
}

describe("AuthProvider", () => {
  beforeEach(() => {
    dependencies.persisted = null; dependencies.recovery = null; observedAuth = null;
    dependencies.refresh.mockReset(); dependencies.revoke.mockReset();
    dependencies.clear.mockReset(); dependencies.write.mockReset();
  });

  it("clears local session, storage and query cache after remote success", async () => {
    dependencies.revoke.mockResolvedValue(undefined);
    const { queryClient } = show();
    queryClient.setQueryData(["dashboard", "business-1"], { private: true });
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent('"status":"unauthenticated"'));
    expect(dependencies.revoke).toHaveBeenCalledWith("refresh-current");
    expect(dependencies.persisted).toBeNull();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("uses the current rotated refresh token", async () => {
    dependencies.refresh.mockResolvedValue({ accessToken: "access-new", refreshToken: "refresh-new", tokenType: "Bearer", expiresIn: 900 });
    dependencies.revoke.mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    await act(async () => { await dependencies.recovery!.recover("access-current"); });
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(dependencies.revoke).toHaveBeenCalledWith("refresh-new"));
  });

  it("keeps local logout authoritative when remote revocation fails", async () => {
    dependencies.revoke.mockRejectedValue(new Error("network"));
    show();
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent('"status":"unauthenticated"'));
    expect(dependencies.persisted).toBeNull();
  });

  it("deduplicates concurrent logout calls", async () => {
    let finish!: () => void;
    dependencies.revoke.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
    show();
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    fireEvent.click(screen.getByRole("button", { name: "logout twice" }));
    expect(dependencies.revoke).toHaveBeenCalledTimes(1);
    await act(async () => finish());
  });

  it("prevents an in-flight refresh from resurrecting the session", async () => {
    let finishRefresh!: (value: Omit<LoginResponse, "user" | "memberships">) => void;
    dependencies.refresh.mockReturnValue(new Promise((resolve) => { finishRefresh = resolve; }));
    dependencies.revoke.mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    const recovery = dependencies.recovery!.recover("access-current");
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    finishRefresh({ accessToken: "access-new", refreshToken: "refresh-new", tokenType: "Bearer", expiresIn: 900 });
    await act(async () => recovery);
    expect(screen.getByRole("status")).toHaveTextContent('"status":"unauthenticated","token":null');
    expect(dependencies.persisted).toBeNull();
  });

  it("does not refresh a late 401 after logout", async () => {
    dependencies.revoke.mockResolvedValue(undefined);
    show();
    fireEvent.click(screen.getByRole("button", { name: "establish" }));
    fireEvent.click(screen.getByRole("button", { name: "logout" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent('"status":"unauthenticated"'));
    await expect(dependencies.recovery!.recover("access-current")).resolves.toBeNull();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it.each(["SESSION", "PERSISTENT"] as const)("updates only the name while preserving tokens, identity and %s persistence", (mode) => {
    show();
    const initial = makeSession();
    act(() => currentAuth().establishSession(initial, mode));
    let accepted = false;
    act(() => { accepted = currentAuth().updateUserProfile({ ...initial.user, displayName: "Jeni", email: "foreign@example.com", status: "DISABLED" }); });
    expect(accepted).toBe(true);
    const expected = { ...initial, user: { ...initial.user, displayName: "Jeni" } };
    expect(currentAuth().session).toEqual(expected);
    expect(dependencies.persisted).toEqual({ ...expected, mode });
    expect(dependencies.write).toHaveBeenLastCalledWith(expected, mode);
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("rejects profile updates without a session, for another identity or without a name", () => {
    show();
    const user = { ...makeSession().user, displayName: "Jeni" };
    expect(currentAuth().updateUserProfile(user)).toBe(false);
    act(() => currentAuth().establishSession(makeSession()));
    dependencies.write.mockClear();
    expect(currentAuth().updateUserProfile({ ...user, id: "user-2" })).toBe(false);
    expect(currentAuth().updateUserProfile(makeSession().user)).toBe(false);
    expect(currentAuth().session).toEqual(makeSession());
    expect(dependencies.write).not.toHaveBeenCalled();
  });

  it("keeps a saved name when an in-flight refresh completes", async () => {
    const refresh = deferred<Tokens>();
    dependencies.refresh.mockReturnValue(refresh.promise);
    show();
    act(() => currentAuth().establishSession(makeSession(), "PERSISTENT"));
    const recovery = dependencies.recovery!.recover("access-current");
    act(() => { expect(currentAuth().updateUserProfile({ ...makeSession().user, displayName: "Nuevo nombre" })).toBe(true); });
    refresh.resolve(rotatedTokens("new"));
    await act(async () => { await recovery; });
    const expected = { ...makeSession(), ...rotatedTokens("new"), user: { ...makeSession().user, displayName: "Nuevo nombre" } };
    expect(currentAuth().session).toEqual(expected);
    expect(dependencies.write).toHaveBeenLastCalledWith(expected, "PERSISTENT");
  });

  it("rejects a late profile response after logout and login as the same user", async () => {
    dependencies.revoke.mockResolvedValue(undefined);
    show();
    act(() => currentAuth().establishSession(makeSession()));
    const updateOldProfile = currentAuth().updateUserProfile;
    await act(async () => { await currentAuth().logout(); });
    act(() => currentAuth().establishSession(makeSession("refresh-login", "access-login")));
    dependencies.write.mockClear();
    expect(updateOldProfile({ ...makeSession().user, displayName: "Respuesta vieja" })).toBe(false);
    expect(currentAuth().session).toEqual(makeSession("refresh-login", "access-login"));
    expect(dependencies.write).not.toHaveBeenCalled();
    act(() => { expect(currentAuth().updateUserProfile({ ...makeSession().user, displayName: "Vigente" })).toBe(true); });
    expect(currentAuth().session?.user.displayName).toBe("Vigente");
  });

  it("invalidates profile callbacks whenever a session is established again", () => {
    show();
    act(() => currentAuth().establishSession(makeSession()));
    const updateOldProfile = currentAuth().updateUserProfile;
    act(() => currentAuth().establishSession(makeSession("refresh-login", "access-login")));
    dependencies.write.mockClear();
    expect(updateOldProfile({ ...makeSession().user, displayName: "Respuesta vieja" })).toBe(false);
    expect(dependencies.write).not.toHaveBeenCalled();
  });

  it("deduplicates only refreshes of the same token and cleans up their own record", async () => {
    const first = deferred<Tokens>();
    const second = deferred<Tokens>();
    dependencies.refresh.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    show();
    act(() => currentAuth().establishSession(makeSession("refresh-first", "access-first")));
    const firstCalls = [dependencies.recovery!.recover("access-first"), dependencies.recovery!.recover("access-first")];
    expect(dependencies.refresh).toHaveBeenCalledTimes(1);
    act(() => currentAuth().establishSession(makeSession("refresh-second", "access-second")));
    const secondCalls = [dependencies.recovery!.recover("access-second"), dependencies.recovery!.recover("access-second")];
    expect(dependencies.refresh).toHaveBeenCalledTimes(2);
    expect(dependencies.refresh).toHaveBeenNthCalledWith(2, "refresh-second");
    first.resolve(rotatedTokens("stale"));
    await act(async () => { expect(await Promise.all(firstCalls)).toEqual([null, null]); });
    secondCalls.push(dependencies.recovery!.recover("access-second"));
    expect(dependencies.refresh).toHaveBeenCalledTimes(2);
    second.resolve(rotatedTokens("new"));
    await act(async () => { expect(await Promise.all(secondCalls)).toEqual(["access-new", "access-new", "access-new"]); });
    expect(currentAuth().session?.refreshToken).toBe("refresh-new");
    const again = deferred<Tokens>();
    dependencies.refresh.mockReturnValueOnce(again.promise);
    act(() => currentAuth().establishSession(makeSession("refresh-second", "access-second")));
    const nextRecovery = dependencies.recovery!.recover("access-second");
    expect(dependencies.refresh).toHaveBeenCalledTimes(3);
    again.resolve(rotatedTokens("again"));
    await act(async () => { await nextRecovery; });
  });

  it("does not let an old restoration replace a newly established session", async () => {
    const refresh = deferred<Tokens>();
    dependencies.persisted = { ...makeSession("refresh-stored", "access-stored"), mode: "SESSION" };
    dependencies.refresh.mockReturnValue(refresh.promise);
    show();
    act(() => currentAuth().establishSession(makeSession("refresh-login", "access-login")));
    refresh.resolve(rotatedTokens("stale"));
    await act(async () => { await refresh.promise; });
    expect(currentAuth().session).toEqual(makeSession("refresh-login", "access-login"));
    expect(dependencies.persisted?.refreshToken).toBe("refresh-login");
  });
});
