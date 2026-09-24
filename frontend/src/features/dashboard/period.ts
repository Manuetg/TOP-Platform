import { businessDateAt } from "../../shared/utils/business-date";
import type { DashboardPeriod } from "./types/dashboard.types";

function calendarDay(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
    ? date.getTime()
    : null;
}

export function validateDashboardPeriod({
  from,
  to,
}: DashboardPeriod): string | null {
  const start = calendarDay(from);
  const end = calendarDay(to);
  if (start === null || end === null)
    return "Ingresa ambas fechas válidas con formato AAAA-MM-DD.";
  if (end <= start) return "Hasta debe ser posterior a Desde.";
  if ((end - start) / 86_400_000 > 31)
    return "Selecciona un período de hasta 31 días.";
  return null;
}

export function isValidDashboardMonth(month: string): boolean {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return false;
  return validateDashboardPeriod(dashboardMonthToPeriod(month)) === null;
}

export function dashboardMonthToPeriod(month: string): DashboardPeriod {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RangeError("Mes de Dashboard inválido");
  const [year, monthNumber] = month.split("-").map(Number);
  const nextYear = monthNumber === 12 ? year + 1 : year;
  const nextMonth = monthNumber === 12 ? 1 : monthNumber + 1;
  return { from: `${month}-01`, to: `${nextYear}-${String(nextMonth).padStart(2, "0")}-01` };
}

export function currentDashboardMonth(timezone = "America/Asuncion", today = new Date()): string {
  return businessDateAt(today, timezone).slice(0, 7);
}

export function initialDashboardMonth(timezone = "America/Asuncion", today = new Date()): string {
  return currentDashboardMonth(timezone, today);
}

export function shiftDashboardMonth(month: string, offset: number): string {
  if (!isValidDashboardMonth(month)) throw new RangeError("Mes de Dashboard inválido");
  const [year, monthNumber] = month.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function formatDashboardMonth(month: string, locale = "es-PY"): string {
  if (!isValidDashboardMonth(month)) return "Mes inválido";
  const [year, monthNumber] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(Date.UTC(year, monthNumber - 1, 1)));
}
