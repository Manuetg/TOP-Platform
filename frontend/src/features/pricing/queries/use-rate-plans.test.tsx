import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { listRatePlans } from "../api/list-rate-plans";
import { useRatePlans } from "./use-rate-plans";

vi.mock("../api/list-rate-plans", () => ({ listRatePlans: vi.fn() }));
beforeEach(() => { vi.mocked(listRatePlans).mockReset(); });
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return { client, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> };
}
it("shares the catalog request between consumers and isolates a different business", async () => {
  vi.mocked(listRatePlans).mockResolvedValue([]);
  const { wrapper, client } = setup();
  const { result, rerender } = renderHook(({ businessId }) => [useRatePlans({ businessId, accessToken: "token" }), useRatePlans({ businessId, accessToken: "token" })], { wrapper, initialProps: { businessId: "a" } });
  await waitFor(() => expect(result.current.every((query) => query.isSuccess)).toBe(true));
  expect(listRatePlans).toHaveBeenCalledTimes(1);
  rerender({ businessId: "b" });
  await waitFor(() => expect(listRatePlans).toHaveBeenCalledTimes(2));
  expect(listRatePlans).toHaveBeenLastCalledWith({ businessId: "b", accessToken: "token" });
  expect(client.getQueryData(["rate-plans", "a"])).toEqual([]);
  client.clear();
});
it("does not call the catalog without a session", () => {
  const { wrapper } = setup();
  renderHook(() => useRatePlans({ businessId: "a", accessToken: null }), { wrapper });
  expect(listRatePlans).not.toHaveBeenCalled();
});
