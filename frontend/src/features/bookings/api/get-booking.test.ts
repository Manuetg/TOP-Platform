import { afterEach, describe, expect, it, vi } from "vitest";
import { getBooking } from "./get-booking";

afterEach(() => vi.unstubAllGlobals());
describe("versión financiera de la reserva", () => {
  const options = { businessId: "business-1", bookingId: "booking-1", accessToken: "synthetic-token" };
  const booking = { id: options.bookingId, businessId: options.businessId, financialSummary: { totalAmountMinor: 400000, paidAmountMinor: 250000, financialVersion: 7, currency: "PYG" } };
  const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
  it.each([0, 7])("conserva versión explícita %s del servidor", async (financialVersion) => {
    const response = { ...booking, financialSummary: { ...booking.financialSummary, financialVersion } };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(response)));
    expect(await getBooking(options)).toEqual(response);
  });
  it.each([undefined, null, -1, 1.5, "7", Number.MAX_SAFE_INTEGER + 1])("rechaza versión financiera inválida %s sin reemplazarla por cero", async (financialVersion) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...booking, financialSummary: { ...booking.financialSummary, financialVersion } })));
    await expect(getBooking(options)).rejects.toMatchObject({ name: "ApiResponseError" });
  });
  it("conserva la ausencia completa de resumen de una reserva sin snapshot", async () => {
    const response = { id: options.bookingId, businessId: options.businessId };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(response)));
    expect(await getBooking(options)).toEqual(response);
  });
  it.each([{ id: "booking-2" }, { businessId: "business-2" }])("rechaza respuesta de otra entidad %s", async (otherContext) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ...booking, ...otherContext })));
    await expect(getBooking(options)).rejects.toMatchObject({ name: "ApiResponseError" });
  });
});
