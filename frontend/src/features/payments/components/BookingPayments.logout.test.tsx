import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { useRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedRoute } from "../../../app/router/ProtectedRoute";
import { AuthProvider, useAuth } from "../../auth/context/AuthContext";
import { AUTH_SESSION_STORAGE_KEY } from "../../auth/storage/auth-session-storage";
import { getOutstandingBalance } from "../api/get-outstanding-balance";
import { listPayments } from "../api/list-payments";
import type { LoginResponse } from "../../auth/types/auth.types";
import type { OutstandingBalance, PaymentHistoryPage } from "../types/payment.types";
import { BookingPayments } from "./BookingPayments";

vi.mock("../../auth/api/logout", () => ({ logout: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../api/get-outstanding-balance", () => ({ getOutstandingBalance: vi.fn() }));
vi.mock("../api/list-payments", () => ({ listPayments: vi.fn() }));
const session: LoginResponse = { accessToken: "access-a", refreshToken: "refresh-a", tokenType: "Bearer", expiresIn: 900, user: { id: "user-a", email: "a@example.com", status: "ACTIVE" }, memberships: [{ businessId: "business-a", role: "OWNER" }] };
const balance: OutstandingBalance = { bookingId: "booking-a", currency: "PYG", totalAmountMinor: 1, paidAmountMinor: 0, outstandingAmountMinor: 1, overdueAmountMinor: 0, financialStatus: "UNPAID", nextDueDate: null, nextDueAmountMinor: null };
const page: PaymentHistoryPage = { items: [], pageInfo: { hasNextPage: false, nextCursor: null } };
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function Controls() { const auth = useAuth(); return <><button onClick={() => auth.establishSession(session)}>Establecer</button><button onClick={() => void auth.logout()}>Salir</button><output>{auth.status}</output></>; }
function Payments() { const auth = useAuth(); return <BookingPayments userId={auth.session?.user.id} businessId="business-a" bookingId="booking-a" accessToken={auth.session?.accessToken} timezone="America/Asuncion" enabled={auth.status === "authenticated"} />; }
function Login() { return <p>Login {useLocation().pathname}</p>; }
function RoutedPayments() { const auth = useAuth(); const hadSession = useRef(false); if (auth.status === "authenticated") hadSession.current = true; if (!hadSession.current) return null; return <MemoryRouter initialEntries={["/app/payments"]}><Routes><Route path="/login" element={<Login />} /><Route path="/app/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} /></Routes></MemoryRouter>; }
function show(client: QueryClient) { return render(<QueryClientProvider client={client}><AuthProvider><Controls /><RoutedPayments /></AuthProvider></QueryClientProvider>); }

beforeEach(() => { sessionStorage.clear(); vi.mocked(getOutstandingBalance).mockReset(); vi.mocked(listPayments).mockReset(); });
describe("Payments logout integration", () => {
  it("retira Payments, aborta reads y limpia sesión y caché mediante logout real", async () => {
    const pendingBalance = deferred<OutstandingBalance>(); const pendingHistory = deferred<PaymentHistoryPage>();
    let balanceSignal: AbortSignal | undefined; let historySignal: AbortSignal | undefined;
    vi.mocked(getOutstandingBalance).mockImplementation(({ signal }) => { balanceSignal = signal; return pendingBalance.promise; });
    vi.mocked(listPayments).mockImplementation(({ signal }) => { historySignal = signal; return pendingHistory.promise; });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    show(client);
    screen.getByRole("button", { name: "Establecer" }).click();
    await waitFor(() => expect(balanceSignal).toBeInstanceOf(AbortSignal));
    screen.getByRole("button", { name: "Salir" }).click();
    await waitFor(() => expect(screen.getByText("Login /login")).toBeVisible());
    expect(screen.getByText("unauthenticated")).toBeVisible();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
    expect(balanceSignal?.aborted).toBe(true); expect(historySignal?.aborted).toBe(true);
    pendingBalance.resolve(balance); pendingHistory.resolve(page);
    await Promise.resolve();
    expect(screen.queryByRole("heading", { name: "Pagos" })).not.toBeInTheDocument();
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
