import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UnauthorizedRecoveryHandler } from "../../../shared/api/api-client";
import type { LoginResponse } from "../types/auth.types";
import { AuthProvider, useAuth } from "./AuthContext";

const dependencies = vi.hoisted(() => ({
  persisted: null as LoginResponse | null,
  recovery: null as UnauthorizedRecoveryHandler | null,
  refresh: vi.fn(), revoke: vi.fn(), clear: vi.fn(), write: vi.fn(),
}));

vi.mock("../api/refresh-session", () => ({ refreshSession: dependencies.refresh }));
vi.mock("../api/logout", () => ({ logout: dependencies.revoke }));
vi.mock("../storage/auth-session-storage", () => ({
  readPersistedAuthSession: () => dependencies.persisted,
  writePersistedAuthSession: (value: LoginResponse) => { dependencies.persisted = value; dependencies.write(value); },
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

function AuthConsumer() {
  const auth = useAuth();
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

describe("AuthProvider logout", () => {
  beforeEach(() => {
    dependencies.persisted = null; dependencies.recovery = null;
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
});
