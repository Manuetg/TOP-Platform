export class FinanceRecognitionError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = 'FinanceRecognitionError'; }
}
export function recognitionRequire(condition: unknown, code: string, message: string): asserts condition {
  if (!condition) throw new FinanceRecognitionError(code, message);
}
export function recognitionDate(value: string): string {
  recognitionRequire(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) && !value.startsWith('0000-'), 'INVALID_DATE', 'Se requiere una fecha pura válida.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  recognitionRequire(Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, 'INVALID_DATE', 'La fecha no existe.');
  return value;
}
export function recognitionMoney(value: number): number {
  recognitionRequire(Number.isSafeInteger(value) && value >= 0, 'INVALID_PYG_AMOUNT', 'El importe PYG debe ser un entero seguro no negativo.');
  return value;
}
export function recognitionSafe(value: bigint): number {
  const max = BigInt(Number.MAX_SAFE_INTEGER);
  recognitionRequire(value >= -max && value <= max, 'MONEY_OVERFLOW', 'La acumulación excede el rango seguro PYG.');
  return Number(value);
}
export function recognitionText(value: string): string {
  recognitionRequire(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= 500 && ![...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127), 'INVALID_EVIDENCE', 'Se requiere texto explícito de 1 a 500 caracteres sin controles.');
  return value.trim();
}
export function recognitionStay(from: string, to: string): string[] {
  recognitionDate(from); recognitionDate(to);
  recognitionRequire(from < to, 'INVALID_STAY', 'La estancia [ingreso,salida) debe ser positiva.');
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const length = (Date.parse(`${to}T00:00:00.000Z`) - start) / 86400000;
  recognitionRequire(length <= 366, 'SOURCE_LIMIT', 'La certificación admite hasta 366 noches; no trunca fuentes.');
  return Array.from({ length }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}
export function recognitionInstant(value: string): string {
  recognitionRequire(typeof value === 'string' && /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value), 'INVALID_INSTANT', 'Se requiere instante UTC exacto con milisegundos.');
  const parsed = new Date(value);
  recognitionRequire(Number.isFinite(parsed.getTime()) && parsed.toISOString() === value && !value.startsWith('0000-'), 'INVALID_INSTANT', 'El instante no es válido.');
  return value;
}
export function recognitionVersion(value: number, minimum = 0): number {
  recognitionRequire(Number.isSafeInteger(value) && value >= minimum, 'INVALID_VERSION', 'La versión debe ser un entero seguro válido.');
  return value;
}
