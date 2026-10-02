import type { BookingFinancialSummary } from "./types/booking.types";

/** Porcentaje en centésimas, con redondeo aritmético y sin multiplicar importes como floats. */
export function paymentPercentageHundredths(paidAmountMinor: number, totalAmountMinor: number | null): bigint | null {
  if (totalAmountMinor === null || !Number.isSafeInteger(totalAmountMinor) || totalAmountMinor <= 0 ||
      !Number.isSafeInteger(paidAmountMinor) || paidAmountMinor < 0 || paidAmountMinor > totalAmountMinor) return null;
  const denominator = BigInt(totalAmountMinor);
  const numerator = BigInt(paidAmountMinor) * 10_000n;
  return (numerator * 2n + denominator) / (denominator * 2n);
}

export function formatPaymentPercentage(paidAmountMinor: number, totalAmountMinor: number | null): string {
  const hundredths = paymentPercentageHundredths(paidAmountMinor, totalAmountMinor);
  if (hundredths === null) return "—";
  if (paidAmountMinor > 0 && hundredths === 0n) return "<0,01%";
  if (totalAmountMinor !== null && paidAmountMinor < totalAmountMinor && hundredths === 10_000n) return ">99,99%";
  const integer = new Intl.NumberFormat("es-PY").format(hundredths / 100n);
  const fraction = (hundredths % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return `${integer}${fraction ? `,${fraction}` : ""}%`;
}

export function getBookingFinancialLabel(summary?: BookingFinancialSummary): string {
  if (!summary || summary.totalAmountMinor === null || summary.currency === null) return "Sin precio";
  if (summary.paidAmountMinor === 0) return "Sin pagos";
  return summary.totalAmountMinor > 0 && summary.paidAmountMinor >= summary.totalAmountMinor ? "Pagada" : "Pago parcial";
}
