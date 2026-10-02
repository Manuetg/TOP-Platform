import { describe, expect, it } from "vitest";
import { formatPaymentPercentage, getBookingFinancialLabel, paymentPercentageHundredths } from "./booking-financial-summary";

describe("resumen financiero de reservas", () => {
  it.each([
    [0, 400000, "0%"],
    [1, 400000, "<0,01%"],
    [1, 3, "33,33%"],
    [2, 3, "66,67%"],
    [1, 32, "3,13%"],
    [100000, 400000, "25%"],
    [400000, 400000, "100%"],
    [120000, 100000, "120%"],
    [11, 10, "110%"],
    [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1, "<100,01%"],
    [Number.MAX_SAFE_INTEGER, 1, "900.719.925.474.099.100%"],
    [Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER, ">99,99%"],
    [4503599627370495, Number.MAX_SAFE_INTEGER, "50%"],
  ])("representa %s/%s sin multiplicar importes en coma flotante", (paid, total, expected) => {
    expect(formatPaymentPercentage(paid, total)).toBe(expected);
  });

  it.each([null, 0, -1, Number.MAX_SAFE_INTEGER + 1, Infinity])("no divide por total inválido %s", (total) => {
    expect(formatPaymentPercentage(0, total)).toBe("—");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])("no inventa un porcentaje para pago inválido %s", (paid) => {
    expect(formatPaymentPercentage(paid, 10)).toBe("—");
  });

  it("conserva las centésimas de ratios mayores que el rango seguro de Number", () => {
    expect(paymentPercentageHundredths(Number.MAX_SAFE_INTEGER, 1)).toBe(BigInt(Number.MAX_SAFE_INTEGER) * 10_000n);
  });

  it("distingue precio ausente, sin pagos, parcial y pagada sin cambiar el estado de reserva", () => {
    expect(getBookingFinancialLabel()).toBe("Sin precio");
    expect(getBookingFinancialLabel({ totalAmountMinor: null, paidAmountMinor: 0, currency: null })).toBe("Sin precio");
    expect(getBookingFinancialLabel({ totalAmountMinor: 0, paidAmountMinor: 0, currency: "PYG" })).toBe("Sin pagos");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" })).toBe("Sin pagos");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 1, currency: "PYG" })).toBe("Pago parcial");
    expect(getBookingFinancialLabel({ totalAmountMinor: 400000, paidAmountMinor: 400000, currency: "PYG" })).toBe("Pagada");
    expect(getBookingFinancialLabel({ totalAmountMinor: 100000, paidAmountMinor: 120000, currency: "PYG" })).toBe("Saldo a favor");
    expect(getBookingFinancialLabel({ totalAmountMinor: 0, paidAmountMinor: 100, creditAmountMinor: 100, currency: "PYG" })).toBe("Saldo a favor");
    expect(getBookingFinancialLabel({ totalAmountMinor: 100, paidAmountMinor: 0, creditAmountMinor: Infinity, currency: "PYG" })).toBe("Sin pagos");
    expect(getBookingFinancialLabel({ totalAmountMinor: 100, paidAmountMinor: Number.MAX_SAFE_INTEGER + 1, currency: "PYG" })).not.toBe("Saldo a favor");
  });
});
