import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOutstandingBalance } from "../api/get-outstanding-balance";
import { listPayments } from "../api/list-payments";
import { useOutstandingBalance } from "./use-outstanding-balance";
import { usePaymentHistory } from "./use-payment-history";

vi.mock("../api/get-outstanding-balance", () => ({ getOutstandingBalance: vi.fn() }));
vi.mock("../api/list-payments", () => ({ listPayments: vi.fn() }));
const input = { userId: "user-a", businessId: "business-a", bookingId: "booking-a", accessToken: "token", enabled: true };
function setup() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> }; }

beforeEach(() => { vi.mocked(getOutstandingBalance).mockReset(); vi.mocked(listPayments).mockReset(); });
describe("Payment read queries", () => {
  it("scopes balance by user, business and booking without retaining prior data", async () => {
    vi.mocked(getOutstandingBalance).mockResolvedValue({ bookingId: "booking-a" } as never);
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook((value) => useOutstandingBalance(value), { initialProps: input, wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(client.getQueryData(["outstanding-balance", "user-a", "business-a", "booking-a"])).toEqual({ bookingId: "booking-a" });
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
    vi.mocked(listPayments).mockResolvedValueOnce({ items: [], pageInfo: { hasNextPage: true, nextCursor: "opaque" } } as never).mockResolvedValueOnce({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } } as never);
    const { wrapper } = setup();
    const { result } = renderHook(() => usePaymentHistory(input), { wrapper });
    await waitFor(() => expect(result.current.hasNextPage).toBe(true));
    await result.current.fetchNextPage();
    expect(listPayments).toHaveBeenNthCalledWith(1, expect.objectContaining({ cursor: null, signal: expect.any(AbortSignal) }));
    expect(listPayments).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "opaque", signal: expect.any(AbortSignal) }));
  });
});
