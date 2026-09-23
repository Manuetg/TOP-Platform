const DAY_MS = 86_400_000;

function dateFormatter(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, calendar: "iso8601", numberingSystem: "latn", year: "numeric", month: "2-digit", day: "2-digit" });
}

function dateFromParts(formatter: Intl.DateTimeFormat, instant: Date | number): string {
  const parts = formatter.formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Fecha pura del Business para un instante; nunca usa la timezone del navegador. */
export function businessDateAt(instant: Date | number, timezone: string): string {
  return dateFromParts(dateFormatter(timezone), instant);
}

/** UTC es solo un soporte de aritmética gregoriana; el resultado no es un instante comercial. */
export function addCalendarDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Primer instante de la fecha local (o de la siguiente si IANA omite una fecha).
 * Busca el límite de fecha, no un offset fijo ni una hora 00:00 que puede no existir.
 * Así un salto DST a la 01:00 y una medianoche repetida conservan el inicio real.
 */
export function businessDayStartInstant(date: string, timezone: string): string {
  const carrier = Date.parse(`${date}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(carrier) || new Date(carrier).toISOString().slice(0, 10) !== date) {
    throw new RangeError("Fecha de calendario inválida");
  }
  const formatter = dateFormatter(timezone);
  let before = carrier - 2 * DAY_MS;
  let after = carrier + 2 * DAY_MS;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (dateFromParts(formatter, middle) < date) before = middle;
    else after = middle;
  }
  return new Date(after).toISOString();
}

export function businessDayInstantRange(date: string, timezone: string) {
  return { start: businessDayStartInstant(date, timezone), end: businessDayStartInstant(addCalendarDays(date, 1), timezone) };
}

export function instantIntersectsRange(start: string, end: string, range: { start: string; end: string }): boolean {
  return Date.parse(start) < Date.parse(range.end) && Date.parse(end) > Date.parse(range.start);
}
