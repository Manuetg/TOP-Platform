import { afterEach, describe, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { registerPayment } from "./register-payment";

afterEach(() => { vi.unstubAllGlobals(); configureUnauthorizedRecovery(null); });
describe("registerPayment", () => {
  it("envía solo el DTO público y conserva la clave al recuperar un 401", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ message: "expired" }), { status: 401 })).mockResolvedValueOnce(new Response(JSON.stringify({ id: "payment", bookingId: "booking", amountMinor: 10, currency: "PYG", method: "CASH", reference: null, note: null, paidAt: "2026-01-01T00:00:00.000Z", createdAt: "2026-01-01T00:00:00.000Z", recordedByUserId: "user", status: "RECORDED" }), { status: 201 }));
    vi.stubGlobal("fetch", fetch); configureUnauthorizedRecovery({ recover: async () => "replacement" });
    await registerPayment({ businessId: "business", bookingId: "booking", accessToken: "old", idempotencyKey: "attempt", payload: { amountMinor: 10, method: "CASH", paidAt: "2026-01-01T00:00:00.000Z" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    const [url, first] = fetch.mock.calls[0] as [string, RequestInit]; const [, second] = fetch.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/businesses/business/bookings/booking/payments"); expect(first.body).toBe(JSON.stringify({ amountMinor: 10, method: "CASH", paidAt: "2026-01-01T00:00:00.000Z" }));
    expect(new Headers(first.headers).get("Idempotency-Key")).toBe("attempt"); expect(new Headers(second.headers).get("Idempotency-Key")).toBe("attempt"); expect(new Headers(second.headers).get("Authorization")).toBe("Bearer replacement");
  });
});
