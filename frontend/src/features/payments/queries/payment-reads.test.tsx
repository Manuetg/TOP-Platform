import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutstandingBalance } from "../api/get-outstanding-balance";
import { listPayments } from "../api/list-payments";
import type { OutstandingBalance, PaymentHistoryPage } from "../types/payment.types";
import { useOutstandingBalance } from "./use-outstanding-balance";
import { usePaymentHistory } from "./use-payment-history";

vi.mock("../api/get-outstanding-balance", () => ({ getOutstandingBalance: vi.fn() }));
vi.mock("../api/list-payments", () => ({ listPayments: vi.fn() }));
const input = { userId: "user-a", businessId: "business-a", bookingId: "booking-a", accessToken: "token", enabled: true };
const balance: OutstandingBalance = { bookingId: "booking-a", currency: "PYG", totalAmountMinor: 1000, paidAmountMinor: 0, outstandingAmountMinor: 1000, overdueAmountMinor: 0, financialStatus: "UNPAID", nextDueDate: null, nextDueAmountMinor: null };
const paymentPage = (id: string, hasNextPage: boolean, nextCursor: string | null): PaymentHistoryPage => ({ items: [{ id, bookingId: "booking-a", amountMinor: 1000, currency: "PYG", method: "CASH", reference: null, note: null, paidAt: "2026-09-02T12:00:00.000Z", createdAt: "2026-09-02T12:00:00.000Z", recordedByUserId: "user-a", status: "RECORDED" }], pageInfo: { hasNextPage, nextCursor } });
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }

beforeEach(() => { vi.mocked(getOutstandingBalance).mockReset(); vi.mocked(listPayments).mockReset(); });
describe("Payment read queries", () => {
  it("scopes balance by user, business and booking without retaining prior data", async () => {
    vi.mocked(getOutstandingBalance).mockResolvedValue(balance);
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook((value) => useOutstandingBalance(value), { initialProps: input, wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["outstanding-balance", "user-a", "business-a", "booking-a"])).toEqual(balance);
    vi.mocked(getOutstandingBalance).mockImplementation(() => new Promise(() => {}));
    rerender({ ...input, userId: "user-b", bookingId: "booking-b" });
    await waitFor(() => expect(getOutstandingBalance).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    client.clear();
  });

  it("does not request without authenticated context and propagates signals to both reads", async () => {
    const { wrapper } = setup();
    renderHook(() => useOutstandingBalance({ ...input, enabled: false }), { wrapper });
    renderHook(() => usePaymentHistory({ ...input, accessToken: null }), { wrapper });
    expect(getOutstandingBalance).not.toHaveBeenCalled();
    expect(listPayments).not.toHaveBeenCalled();
  });

  it("uses the opaque next cursor once for the next payment page", async () => {
    vi.mocked(listPayments).mockResolvedValueOnce(paymentPage("payment-1", true, "opaque")).mockResolvedValueOnce(paymentPage("payment-2", false, null));
    const { wrapper } = setup();
    const { result } = renderHook(() => usePaymentHistory(input), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();
    expect(listPayments).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: null, signal: expect.any(AbortSignal) }));
    expect(listPayments).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "opaque", signal: expect.any(AbortSignal) }));
  });

  it("keeps the first page and retries the same cursor after a controlled next-page transport failure", async () => {
    const firstPage = paymentPage("payment-1", true, "opaque");
    const secondPage = paymentPage("payment-2", false, null);
    vi.mocked(listPayments).mockResolvedValueOnce(firstPage).mockRejectedValueOnce(new Error("transport")).mockResolvedValueOnce(secondPage);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePaymentHistory(input), { wrapper });
    await waitFor(() => expect(result.current.data?.pages).toEqual([firstPage]));
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.isFetchNextPageError).toBe(true));
    expect(result.current.data?.pages).toEqual([firstPage]);
    expect(listPayments).toHaveBeenCalledTimes(2);
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.data?.pages).toEqual([firstPage, secondPage]));
    expect(listPayments).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "opaque" }));
    expect(listPayments).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: "opaque" }));
  });

  it("aborts an obsolete history request when the booking context changes", async () => {
    let firstSignal: AbortSignal | undefined;
    vi.mocked(listPayments).mockImplementation(({ signal, bookingId }) => {
      if (bookingId === "booking-a") {
        firstSignal = signal;
        return new Promise<PaymentHistoryPage>(() => {});
      }
      return Promise.resolve(paymentPage("payment-2", false, null));
    });
    const { wrapper } = setup();
    const { rerender } = renderHook((value) => usePaymentHistory(value), { initialProps: input, wrapper });
    await waitFor(() => expect(firstSignal).toBeInstanceOf(AbortSignal));
    rerender({ ...input, bookingId: "booking-b" });
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(2));
    expect(firstSignal?.aborted).toBe(true);
  });
});
