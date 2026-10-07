import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { saveBookingAmendment } from "../api/booking-amendment";
import { useBookingAmendment } from "./use-booking-amendment";

vi.mock("../api/booking-amendment", () => ({ previewBookingAmendment: vi.fn(), saveBookingAmendment: vi.fn() }));
const clients: QueryClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) client.clear(); vi.clearAllMocks(); });

it("invalida el negocio del envío tardío y conserva intactas las finanzas de otra reserva y tenant", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const original = [["bookings", "business-1"], ["booking-timeline", "business-1", "booking-1"], ["payments", "balance", "business-1", "booking-1"], ["payments", "plan", "business-1", "booking-1"], ["payments", "history", "business-1", "booking-1"], ["availability", "calendar", "business-1"], ["dashboard", "business-1"]];
  const untouched = [["bookings", "business-2"], ["payments", "balance", "business-1", "booking-2"], ["payments", "plan", "business-2", "booking-1"], ["booking-timeline", "business-2", "booking-1"], ["dashboard", "business-2"]];
  for (const key of [...original, ...untouched]) client.setQueryData(key, { marker: true });
  let resolve!: (value: unknown) => void;
  vi.mocked(saveBookingAmendment).mockImplementation(() => new Promise((done) => { resolve = (value) => done(value as Awaited<ReturnType<typeof saveBookingAmendment>>); }));
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook((context) => useBookingAmendment(context), { wrapper, initialProps: { businessId: "business-1", bookingId: "booking-1", accessToken: "token-1" } });
  let pending!: Promise<unknown>;
  act(() => { pending = result.current.save({ notes: "Cambio", expectedUpdatedAt: "2026-10-02T00:00:00Z", currentPricingId: "price-1", expectedPaidAmountMinor: 0, expectedFinancialVersion: 7, acceptedQuote: { currency: "PYG", totalAmountMinor: 0, items: [], fingerprint: "f".repeat(64) } }, new AbortController().signal); });
  await waitFor(() => expect(saveBookingAmendment).toHaveBeenCalledOnce());
  rerender({ businessId: "business-2", bookingId: "booking-2", accessToken: "token-2" });
  await act(async () => { resolve({ id: "booking-1" }); await pending; });
  expect(saveBookingAmendment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-1", bookingId: "booking-1", accessToken: "token-1" }));
  for (const key of original) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  for (const key of untouched) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
});
