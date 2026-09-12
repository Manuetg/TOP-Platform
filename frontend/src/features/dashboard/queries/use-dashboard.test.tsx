import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getBusinessDashboard } from "../api/get-dashboard";
import { useDashboard } from "./use-dashboard";
import type { DashboardRequest, DashboardResponse } from "../types/dashboard.types";

vi.mock("../api/get-dashboard", () => ({ getBusinessDashboard: vi.fn() }));
const read = vi.mocked(getBusinessDashboard);
const options = { businessId: "a", from: "2026-09-01", to: "2026-09-08", accessToken: "token" };
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, wrapper };
}
beforeEach(() => read.mockReset());
describe("useDashboard", () => {
  it("isolates Business and period and never keeps the previous metrics during a new request", async () => {
    const data = { revenue: { currency: "PYG", amountMinor: 12500000 } } as DashboardResponse;
    read.mockResolvedValueOnce(data);
    const { client, wrapper } = setup();
    const { result, rerender } = renderHook((input: DashboardRequest) => useDashboard(input), { initialProps: options, wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(read).toHaveBeenCalledWith(options);
    expect(client.getQueryData(["dashboard", "a", options.from, options.to])).toEqual(data);
    read.mockImplementation(() => new Promise(() => {}));
    rerender({ ...options, businessId: "b" });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(result.current.data).toBeUndefined();
    rerender({ ...options, businessId: "b", to: "2026-09-09" });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(3));
    expect(result.current.data).toBeUndefined();
    expect(client.getQueryCache().getAll()).toHaveLength(3);
    client.clear();
  });
  it.each([{ ...options, businessId: "" }, { ...options, accessToken: "" }, { ...options, to: "" }, { ...options, to: "2026-11-01" }])("does not request with missing context or invalid period", (input) => {
    const { wrapper } = setup();
    const { result } = renderHook(() => useDashboard(input), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(read).not.toHaveBeenCalled();
  });
});
