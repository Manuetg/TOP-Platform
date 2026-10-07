import { afterEach, describe, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { previewBookingAmendment, saveBookingAmendment } from "./booking-amendment";

afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });
describe("amendment requests sin replay de autenticación", () => {
  it.each(["preview", "save"] as const)("un 401 de %s no refresca ni vuelve a enviar la intención", async (operation) => {
    const recover = vi.fn().mockResolvedValue("replacement-synthetic-token");
    configureUnauthorizedRecovery({ recover });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "No autorizado" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const context = { businessId: "business-1", bookingId: "booking-1", accessToken: "synthetic-token" };
    const pending = operation === "preview" ? previewBookingAmendment({ ...context, input: { notes: "Cambio" } }) :
      saveBookingAmendment({ ...context, input: { notes: "Cambio", expectedUpdatedAt: "2026-10-02T00:00:00Z", currentPricingId: "snapshot-1", expectedPaidAmountMinor: 0, acceptedQuote: { currency: "PYG", totalAmountMinor: 1, items: [], fingerprint: "f".repeat(64) } } });
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: operation === "preview" ? "POST" : "PATCH" });
    expect(new Headers(fetch.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer synthetic-token");
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("skipUnauthorizedRecovery");
  });
});
