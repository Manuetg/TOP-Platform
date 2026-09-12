import { afterEach, expect, it, vi } from "vitest";
import { listRatePlans } from "./list-rate-plans";
import { ApiError } from "../../../shared/api/api-client";
afterEach(() => vi.unstubAllGlobals());
it("reads the general tenant catalog without contextual filters and preserves archived plans", async () => {
  const data = [
    { id: "p1", status: "ACTIVE" },
    { id: "p2", status: "ARCHIVED" },
  ];
  const request = vi
    .fn()
    .mockResolvedValue(new Response(JSON.stringify(data), { status: 200 }));
  vi.stubGlobal("fetch", request);
  await expect(
    listRatePlans({ businessId: "b", accessToken: "token" }),
  ).resolves.toEqual(data);
  const [url, options] = request.mock.calls[0] as [string, RequestInit];
  expect(new URL(url).pathname).toBe("/api/businesses/b/rate-plans");
  expect(new URL(url).search).toBe("");
  expect(new Headers(options.headers).get("Authorization")).toBe(
    "Bearer token",
  );
});
it("returns a real empty catalog", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("[]", { status: 200 })),
  );
  await expect(listRatePlans({ businessId: "b" })).resolves.toEqual([]);
});
it("propagates errors rather than substituting demo plans", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("{}", { status: 403 })),
  );
  await expect(listRatePlans({ businessId: "b" })).rejects.toBeInstanceOf(
    ApiError,
  );
});
