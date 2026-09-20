import { afterEach, describe, expect, it, vi } from "vitest";
import { getOutstandingBalance } from "./get-outstanding-balance";
import { listPayments } from "./list-payments";

afterEach(() => vi.unstubAllGlobals());

describe("Payment read clients", () => {
  it("requests the balance with the scoped path, token and signal", async () => {
    const controller = new AbortController();
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ bookingId: "booking" }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await getOutstandingBalance({ businessId: "business/a", bookingId: "booking/b", accessToken: "token", signal: controller.signal });
    const [url, options] = fetch.mock.calls[0] as [string, RequestInit];
    expect(new URL(url).pathname).toBe("/api/businesses/business%2Fa/bookings/booking%2Fb/outstanding-balance");
    expect(options.method).toBe("GET");
    expect(options.signal).toBe(controller.signal);
    expect(new Headers(options.headers).get("Authorization")).toBe("Bearer token");
  });

  it("keeps the cursor opaque and always requests twenty history items", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [], pageInfo: { hasNextPage: false, nextCursor: null } }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    await listPayments({ businessId: "business", bookingId: "booking", cursor: "opaque+/=cursor", accessToken: "token" });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.searchParams.get("limit")).toBe("20");
    expect(url.searchParams.get("cursor")).toBe("opaque+/=cursor");
  });
});
