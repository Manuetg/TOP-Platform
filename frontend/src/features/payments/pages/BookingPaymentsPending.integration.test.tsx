import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Booking } from "../../bookings/types/booking.types";
import type { Payment } from "../types/payment.types";
import { BookingPaymentsPage } from "./BookingPaymentsPage";

vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: "authenticated", session: { accessToken: "synthetic-token", user: { id: "user-1" } } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ status: "ready", activeRole: "OWNER", activeBusinessId: "business-1", activeBusiness: { id: "business-1", status: "ACTIVE", currency: "PYG", timezone: "America/Asuncion" } }) }));

const clients: QueryClient[] = [];
afterEach(() => { cleanup(); for (const client of clients.splice(0)) client.clear(); vi.unstubAllGlobals(); });

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function setup(mode: "success" | "lost-response" | "deferred") {
  const booking: Booking = {
    id: "booking-1", businessId: "business-1", status: "PENDING", contactId: "contact-1", resourceIds: ["resource-1"],
    checkInDate: "2026-10-02", checkOutDate: "2026-10-04", adults: 2, children: 0, notes: null,
    createdAt: "2026-10-01T12:00:00.000Z", updatedAt: "2026-10-01T12:00:00.000Z",
    financialSummary: { totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" },
  };
  const nextBooking: Booking = { ...booking, id: "booking-2", financialSummary: { totalAmountMinor: 600000, paidAmountMinor: 0, currency: "PYG" } };
  const bookings = new Map([[booking.id, booking], [nextBooking.id, nextBooking]]);
  const recorded = new Map<string, Payment>();
  let dropResponse = mode === "lost-response";
  let resolvePayment: (() => void) | undefined;
  let navigateAccount: ReturnType<typeof useNavigate>;
  function RouteControls() { navigateAccount = useNavigate(); return null; }
  const requests: Array<{ path: string; method: string; key: string | null }> = [];
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    const method = init.method ?? "GET";
    const key = new Headers(init.headers).get("Idempotency-Key");
    requests.push({ path, method, key });
    const requestedBooking = bookings.get(path.match(/\/bookings\/([^/]+)/)?.[1] ?? "");
    if (method === "POST" && path.endsWith("/payments")) {
      if (recorded.has(key!)) return json(recorded.get(key!));
      if (!requestedBooking) throw new Error(`Reserva inesperada: ${path}`);
      const body = JSON.parse(String(init.body));
      const payment: Payment = { id: `payment-${recorded.size + 1}`, bookingId: requestedBooking.id, amountMinor: body.amountMinor, currency: "PYG", method: body.method, paidAt: body.paidAt, reference: null, note: null, recordedByUserId: "user-1", createdAt: body.paidAt, status: "RECORDED" };
      recorded.set(key!, payment);
      requestedBooking.status = "CONFIRMED";
      requestedBooking.financialSummary!.paidAmountMinor += payment.amountMinor;
      if (dropResponse) { dropResponse = false; throw new TypeError("Respuesta perdida"); }
      if (mode === "deferred") return new Promise<Response>((resolve) => { resolvePayment = () => resolve(json(payment)); });
      return json(payment);
    }
    if (requestedBooking && path.endsWith(`/bookings/${requestedBooking.id}`)) return json(requestedBooking);
    if (path.endsWith("/contacts")) return json([{ id: "contact-1", fullName: "Contacto de prueba" }]);
    if (requestedBooking && path.endsWith("/outstanding-balance")) {
      const summary = requestedBooking.financialSummary!;
      return json({ bookingId: requestedBooking.id, currency: "PYG", totalAmountMinor: summary.totalAmountMinor, paidAmountMinor: summary.paidAmountMinor, outstandingAmountMinor: summary.totalAmountMinor! - summary.paidAmountMinor, overdueAmountMinor: 0, financialStatus: summary.paidAmountMinor ? "PARTIALLY_PAID" : "UNPAID", nextDueDate: null, nextDueAmountMinor: null });
    }
    if (path.endsWith("/payment-plan")) return json({ message: "Sin plan" }, 404);
    if (requestedBooking && path.endsWith("/payments")) return json({ items: [...recorded.values()].filter((payment) => payment.bookingId === requestedBooking.id), pageInfo: { nextCursor: null, hasNextPage: false } });
    throw new Error(`Request inesperado: ${method} ${path}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/bookings/booking-1/payments"]}><RouteControls /><Routes>
    <Route path="/app/bookings/:bookingId/payments" element={<BookingPaymentsPage />} />
  </Routes></MemoryRouter></QueryClientProvider>);
  return { booking, nextBooking, recorded, requests, client, user: userEvent.setup(), navigateAccount: (path: string) => navigateAccount(path), resolvePayment: () => resolvePayment!() };
}

describe("primer pago de Pendiente con transporte y queries reales", () => {
  it.each(["success", "lost-response"] as const)("refresca Confirmada y Pago parcial después del cobro mínimo: %s", async (mode) => {
    const { booking, recorded, requests, user } = setup(mode);
    await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
    const dialog = screen.getByRole("dialog", { name: "Registrar pago" });
    fireEvent.change(within(dialog).getByLabelText("Monto recibido"), { target: { value: "1" } });
    await user.click(within(dialog).getByRole("button", { name: "Registrar pago" }));
    if (mode === "lost-response") {
      expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
      expect(recorded.size).toBe(1);
      await user.click(within(dialog).getByRole("button", { name: "Registrar pago" }));
    }
    await waitFor(() => expect(screen.getByText("Confirmada", { selector: ".payments-reservation-meta span" })).toBeVisible());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Pago parcial", { selector: ".payments-account-status" })).toBeVisible();
    expect(screen.getByText("<0,01%")).toBeVisible();
    expect(recorded.size).toBe(1);
    expect(booking.financialSummary!.paidAmountMinor).toBe(1);
    const posts = requests.filter((request) => request.method === "POST");
    expect(posts).toHaveLength(mode === "success" ? 1 : 2);
    expect(posts.every((request) => request.path.endsWith("/payments"))).toBe(true);
    expect(new Set(posts.map((request) => request.key)).size).toBe(1);
    expect(requests.filter((request) => request.method === "GET" && request.path.endsWith("/bookings/booking-1")).length).toBeGreaterThanOrEqual(2);
  });

  it("conserva el formulario nuevo cuando llega la respuesta de otra reserva", async () => {
    const { nextBooking, recorded, requests, client, user, navigateAccount, resolvePayment } = setup("deferred");
    await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
    const previousDialog = screen.getByRole("dialog", { name: "Registrar pago" });
    fireEvent.change(within(previousDialog).getByLabelText("Monto recibido"), { target: { value: "1" } });
    await user.click(within(previousDialog).getByRole("button", { name: "Registrar pago" }));
    await waitFor(() => expect(recorded.size).toBe(1));

    act(() => navigateAccount("/app/bookings/booking-2/payments"));
    expect(previousDialog).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
    const newDialog = screen.getByRole("dialog", { name: "Registrar pago" });
    fireEvent.change(within(newDialog).getByLabelText("Monto recibido"), { target: { value: "123" } });
    await act(async () => resolvePayment());
    await waitFor(() => expect(client.getQueryState(["bookings", "business-1", "booking-1"])?.isInvalidated).toBe(true));

    expect(screen.getByRole("dialog", { name: "Registrar pago" })).toBe(newDialog);
    expect(within(newDialog).getByLabelText("Monto recibido")).toHaveValue(123);
    expect(within(newDialog).getByRole("button", { name: "Registrar pago" })).toBeEnabled();
    expect(nextBooking.status).toBe("PENDING");
    expect(nextBooking.financialSummary!.paidAmountMinor).toBe(0);
    expect(requests.filter((request) => request.method === "POST").map((request) => request.path)).toEqual([expect.stringContaining("/bookings/booking-1/payments")]);
    expect(client.getQueryState(["payments", "balance", "business-1", "booking-2"])?.isInvalidated).toBe(false);
  });
});
