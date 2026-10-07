import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { afterEach, expect, it, vi } from "vitest";
import type { Booking } from "../types/booking.types";
import { useBooking } from "./use-booking";
import { useBookingOperation } from "./use-booking-operation";

const options = { userId: "user-1", businessId: "business-1", bookingId: "booking-1", accessToken: "fixture-token" };
const version = "2026-10-02T12:00:00.000Z", nextVersion = "2026-10-02T13:00:00.000Z";
const booking: Booking = { id: options.bookingId, businessId: options.businessId, status: "CONFIRMED", contactId: null, resourceIds: ["resource-1"], checkInDate: "2026-10-06", checkOutDate: "2026-10-08", adults: 2, children: 0, notes: null, createdAt: version, updatedAt: version };
const summary = { totalAmountMinor: 500000, paidAmountMinor: 100000, currency: "PYG" };
const detailKey = ["bookings", options.businessId, options.bookingId];
const clients: QueryClient[] = [];
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function provider() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); clients.push(client);
  return { client, wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

it("preserva el resumen GET al recibir un POST plano y recarga el detalle enriquecido", async () => {
  const canonical = deferred<Response>(); let getCount = 0;
  vi.stubGlobal("fetch", vi.fn((_input: RequestInfo | URL, init: RequestInit = {}) => {
    if (init.method === "POST") return Promise.resolve(json({ ...booking, status: "IN_PROGRESS", updatedAt: nextVersion }));
    getCount++;
    return getCount === 1 ? Promise.resolve(json({ ...booking, financialSummary: summary })) : canonical.promise;
  }));
  const { client, wrapper } = provider();
  const { result } = renderHook(() => ({ detail: useBooking(options), operation: useBookingOperation(options) }), { wrapper });
  await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
  let pending!: Promise<Booking>;
  act(() => { pending = result.current.operation.mutateAsync({ operation: "check-in", expectedUpdatedAt: version, signal: new AbortController().signal, isCurrent: () => true }); });
  await waitFor(() => expect(getCount).toBe(2));
  expect(client.getQueryData(detailKey)).toEqual(expect.objectContaining({ status: "IN_PROGRESS", financialSummary: summary }));
  const refreshed = { ...summary, paidAmountMinor: 150000 };
  await act(async () => { canonical.resolve(json({ ...booking, status: "IN_PROGRESS", updatedAt: nextVersion, financialSummary: refreshed })); await pending; });
  expect(client.getQueryData(detailKey)).toEqual(expect.objectContaining({ financialSummary: refreshed }));
  await waitFor(() => expect(result.current.detail.data).toEqual(expect.objectContaining({ financialSummary: refreshed })));
});

it("una respuesta conocida fuera del scope invalida sólo caches originales y conserva el detalle actual", async () => {
  const response = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn(() => response.promise));
  const { client, wrapper } = provider();
  const originalKeys = [detailKey, ["bookings", "business-1", "", "", ""], ["booking-timeline", "business-1", "booking-1"], ["availability", "calendar", "business-1"], ["availability", "check", "business-1"], ["dashboard", "business-1"], ["outstanding-balance", "user-1", "business-1", "booking-1"]];
  const untouchedKeys = [["bookings", "business-1", "booking-2"], ["bookings", "business-2", "booking-2"], ["booking-timeline", "business-2", "booking-2"], ["availability", "calendar", "business-2"], ["dashboard", "business-2"], ["outstanding-balance", "user-2", "business-2", "booking-2"], ["outstanding-balance", "user-2", "business-1", "booking-1"]];
  originalKeys.forEach((key) => client.setQueryData(key, key === detailKey ? booking : [])); untouchedKeys.forEach((key) => client.setQueryData(key, []));
  let current = true; const request = new AbortController();
  const { result } = renderHook(() => useBookingOperation(options), { wrapper });
  let pending!: Promise<Booking>;
  act(() => { pending = result.current.mutateAsync({ operation: "check-in", expectedUpdatedAt: version, signal: request.signal, isCurrent: () => current }); });
  current = false;
  await act(async () => { response.resolve(json({ ...booking, status: "IN_PROGRESS", updatedAt: nextVersion })); await pending; });
  expect(request.signal.aborted).toBe(false);
  expect(client.getQueryData(detailKey)).toEqual(booking);
  originalKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)); untouchedKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(false));
});
