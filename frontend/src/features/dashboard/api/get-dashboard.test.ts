import { afterEach, describe, expect, it, vi } from "vitest";
import { getBusinessDashboard } from "./get-dashboard";
import { ApiError } from "../../../shared/api/api-client";

afterEach(() => vi.unstubAllGlobals());
describe("getBusinessDashboard", () => {
  it("uses the business path, encoded period and bearer token and returns the response unchanged", async () => {
    const response = { occupancy: { occupancyRateBasisPoints: null }, revenue: { currency: "PYG", amountMinor: 0 }, reservations: { total: 0 } };
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify(response), { status: 200 }));
    vi.stubGlobal("fetch", request);
    await expect(getBusinessDashboard({ businessId: "business/a", from: "2026-09-01", to: "2026-09-08", accessToken: "token" })).resolves.toEqual(response);
    const [url, options] = request.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/businesses/business%2Fa/dashboard");
    expect([...new URL(url).searchParams]).toEqual([["from", "2026-09-01"], ["to", "2026-09-08"]]);
    expect(options.method).toBe("GET");
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
  });
  it("propagates backend errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Forbidden" }), { status: 403 })));
    await expect(getBusinessDashboard({ businessId: "b", from: "2026-09-01", to: "2026-09-08" })).rejects.toEqual(new ApiError(403, "Forbidden"));
  });
});
