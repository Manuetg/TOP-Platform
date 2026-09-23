/** Los contratos monetarios usan la unidad menor de la moneda; PYG no tiene decimales. */
export function formatMoney(amountMinor: number, currency = "PYG"): string {
  if (currency === "PYG") return `₲ ${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 }).format(amountMinor)}`;
  const formatter = new Intl.NumberFormat("es-PY", { style: "currency", currency });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(amountMinor / 10 ** digits);
}

/** Entrada es-PY: enteros, con separador de miles opcional; nunca redondea un importe. */
export function parseGuaranies(value: string, allowZero = false): number | null {
  const input = value.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)$/.test(input)) return null;
  const amount = Number(input.replace(/\./g, ""));
  return Number.isSafeInteger(amount) && amount >= (allowZero ? 0 : 1) ? amount : null;
}
