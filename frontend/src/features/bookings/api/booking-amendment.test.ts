import { afterEach, describe, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { previewBookingAmendment, saveBookingAmendment } from "./booking-amendment";
import type { SaveBookingAmendmentInput } from "../types/booking-amendment.types";

afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });
describe("amendment requests sin replay de autenticación", () => {
  it.each(["preview", "save"] as const)("un 401 de %s no refresca ni vuelve a enviar la intención", async (operation) => {
    const recover = vi.fn().mockResolvedValue("replacement-synthetic-token");
    configureUnauthorizedRecovery({ recover });
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "No autorizado" }), { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    const context = { businessId: "business-1", bookingId: "booking-1", accessToken: "synthetic-token" };
    const pending = operation === "preview" ? previewBookingAmendment({ ...context, input: { notes: "Cambio" } }) :
      saveBookingAmendment({ ...context, input: { notes: "Cambio", expectedUpdatedAt: "2026-10-02T00:00:00Z", currentPricingId: "snapshot-1", expectedPaidAmountMinor: 0, expectedFinancialVersion: 7, acceptedQuote: { currency: "PYG", totalAmountMinor: 1, items: [], fingerprint: "f".repeat(64) } } });
    await expect(pending).rejects.toMatchObject({ status: 401 });
    expect(recover).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: operation === "preview" ? "POST" : "PATCH" });
    expect(new Headers(fetch.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer synthetic-token");
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("skipUnauthorizedRecovery");
  });
});

describe("CAS financiero de amendment", () => {
  const context = { businessId: "business-1", bookingId: "booking-1", accessToken: "synthetic-token" };
  const input: SaveBookingAmendmentInput = { notes: "Cambio", expectedUpdatedAt: "2026-10-02T00:00:00Z", currentPricingId: "snapshot-1", expectedPaidAmountMinor: 250000, expectedFinancialVersion: 7, acceptedQuote: { currency: "PYG", totalAmountMinor: 400000, items: [], fingerprint: "f".repeat(64) } };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  it.each([0, 7])("conserva expectedFinancialVersion %s del servidor sin derivarlo del pago", async (financialVersion) => {
    const preview = { expectedFinancialVersion: financialVersion, expectedPaidAmountMinor: 250000, financialSummary: { financialVersion, paidAmountMinor: 250000 } };
    const fetch = vi.fn().mockResolvedValueOnce(json(preview)).mockResolvedValueOnce(json({ id: context.bookingId }));
    vi.stubGlobal("fetch", fetch);
    const response = await previewBookingAmendment({ ...context, input: { notes: "Cambio" } });
    await saveBookingAmendment({ ...context, input: { ...input, expectedFinancialVersion: response.expectedFinancialVersion } });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ expectedFinancialVersion: financialVersion, expectedPaidAmountMinor: 250000 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each([undefined, null, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1])("rechaza preview con versión inválida %s", async (expectedFinancialVersion) => {
    const fetch = vi.fn().mockResolvedValue(json({ expectedFinancialVersion, financialSummary: { financialVersion: expectedFinancialVersion } }));
    vi.stubGlobal("fetch", fetch);
    await expect(previewBookingAmendment({ ...context, input: { notes: "Cambio" } })).rejects.toMatchObject({ name: "ApiResponseError" });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it.each([undefined, 8])("rechaza preview con financialSummary versión %s distinta del CAS", async (financialVersion) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ expectedFinancialVersion: 7, financialSummary: { financialVersion } })));
    await expect(previewBookingAmendment({ ...context, input: { notes: "Cambio" } })).rejects.toMatchObject({ name: "ApiResponseError" });
  });

  it.each([undefined, null, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1])("no publica PATCH con CAS inválido %s", async (expectedFinancialVersion) => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const invalidInput = { ...input, expectedFinancialVersion } as unknown as SaveBookingAmendmentInput;
    await expect(saveBookingAmendment({ ...context, input: invalidInput })).rejects.toMatchObject({ name: "ApiResponseError" });
    expect(fetch).not.toHaveBeenCalled();
  });
});
