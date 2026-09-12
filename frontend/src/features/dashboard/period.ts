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

export function initialDashboardPeriod(today = new Date()): DashboardPeriod {
  const format = (offset: number) => {
    const date = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
    );
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  // Solo propone fechas de calendario del navegador; backend aplica la timezone del Business.
  return { from: format(-6), to: format(1) };
}
