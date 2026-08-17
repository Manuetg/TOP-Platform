const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const millisecondsPerDay = 24 * 60 * 60 * 1000;

export function isValidPricingDate(value: unknown): value is string {
  if (typeof value !== 'string' || !dateOnlyPattern.test(value)) return false;

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function pricingDateDaysBetween(startDate: string, endDate: string): number {
  return (Date.parse(`${endDate}T00:00:00.000Z`) - Date.parse(`${startDate}T00:00:00.000Z`)) / millisecondsPerDay;
}

export function addPricingDateDays(date: string, days: number): string {
  const result = new Date(Date.parse(`${date}T00:00:00.000Z`) + days * millisecondsPerDay);
  return result.toISOString().slice(0, 10);
}
