import { describe, expect, it } from "vitest";
import { formatPaymentPercentage, getBookingFinancialLabel } from "./booking-financial-summary";

describe("resumen financiero de reservas", () => {
  it.each([
    [0, 400000, "0%"],
    [1, 400000, "<0,01%"],
    [1, 3, "33,33%"],
    [2, 3, "66,67%"],
    [1, 32, "3,13%"],
    [100000, 400000, "25%"],
    [400000, 400000, "100%"],
    [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER, ">99,99%"],
    [4503599627370495, Number.MAX_SAFE_INTEGER, "50%"],
  ])("representa %s/%s sin multiplicar importes en coma flotante", (paid, total, expected) => {
    expect(formatPaymentPercentage(paid, total)).toBe(expected);
  });

  it.each([null, 0, -1, Number.MAX_SAFE_INTEGER + 1, Infinity])("no divide por total inválido %s", (total) => {
    expect(formatPaymentPercentage(0, total)).toBe("—");
  });

  it.each([-1, 1.5, 11, Number.MAX_SAFE_INTEGER + 1, Infinity])("no inventa un porcentaje para pago inválido %s", (paid) => {
    expect(formatPaymentPercentage(paid, 10)).toBe("—");
  });

  it("distingue precio ausente, sin pagos, parcial y pagada sin cambiar el estado de reserva", () => {
    expect(getBookingFinancialLabel()).toBe("Sin precio");
    expect(getBookingFinancialLabel({ totalAmountMinor: null, paidAmountMinor: 0, currency: null })).toBe("Sin precio");
    expect(getBookingFinancialLabel({ totalAmountMinor: 0, paidAmountMinor: 0, currency: "PYG" })).toBe("Sin pagos");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" })).toBe("Sin pagos");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 1, currency: "PYG" })).toBe("Pago parcial");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 400000, currency: "PYG" })).toBe("Pagada");
  });
});
