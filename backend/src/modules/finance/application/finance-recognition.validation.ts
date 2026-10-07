import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceIdempotencyKey, parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceBookingResultQuery } from '../domain/finance-booking-result.types';
import type { CertifyServiceCommand } from '../domain/finance-recognition.types';
import type { FinanceProfitabilityQuery, FinanceTerminalRecognitionCommand } from './finance-recognition.operations';

export { parseFinanceIdempotencyKey as parseFinanceRecognitionIdempotencyKey, parseFinanceUuid as parseFinanceRecognitionUuid };
type Input = Record<string, unknown>;

export function financeRecognitionStrict(value: unknown, fields: readonly string[]): Input {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FinanceInputError('Se requiere un objeto simple.');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new FinanceInputError('Se requiere un objeto simple.');
  const input = value as Input;
  if (Reflect.ownKeys(input).some(key => typeof key !== 'string' || !fields.includes(key))) throw new FinanceInputError('Hay campos no admitidos.');
  return input;
}

export function financeRecognitionDate(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value) || value.startsWith('0000-')) throw new FinanceInputError('Se requiere fecha YYYY-MM-DD válida.');
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new FinanceInputError('La fecha no existe.');
  return value;
}

export function financeRecognitionInstant(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(value) || value.startsWith('0000-')) throw new FinanceInputError('Se requiere instante UTC exacto con milisegundos.');
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== value) throw new FinanceInputError('El instante no existe.');
  return value;
}

export function financeRecognitionText(value: unknown): string {
  if (typeof value !== 'string' || [...value].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new FinanceInputError('Se requiere texto sin controles.');
  const result = value.trim();
  if (!result || result.length > 500) throw new FinanceInputError('El texto requiere de 1 a 500 caracteres.');
  return result;
}

export function financeRecognitionInteger(value: unknown, minimum = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new FinanceInputError('Se requiere un entero seguro válido.');
  return value;
}

export function financeRecognitionToken(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new FinanceInputError('Se requiere el token SHA256 del corte consultado.');
  return value;
}

function nullableUuid(value: unknown): string | null { return value === null ? null : parseFinanceUuid(value); }
function nullableDate(value: unknown): string | null { return value === null ? null : financeRecognitionDate(value); }

function certificateReference(id: string | null, version: number): void {
  if ((version === 0) !== (id === null)) throw new FinanceInputError('La versión cero requiere referencia null; otras versiones requieren certificado.');
}

function servedNights(value: unknown, version: number): string[] {
  if (!Array.isArray(value) || value.length > 366 || (version === 0 && value.length === 0)) throw new FinanceInputError('Se requieren hasta 366 noches y un certificado inicial no vacío.');
  const nights = value.map(financeRecognitionDate);
  if (new Set(nights).size !== nights.length) throw new FinanceInputError('Las noches deben ser únicas.');
  return nights;
}

export function parseFinanceServiceCertificateCommand(value: unknown): CertifyServiceCommand {
  const input = financeRecognitionStrict(value, ['bookingId', 'expectedBookingUpdatedAt', 'expectedCertificateVersion', 'expectedPricingSourceId', 'servedNights', 'effectiveCheckInOn', 'effectiveCheckOutOn', 'evidence', 'reason', 'supersedesCertificateId']);
  const expectedCertificateVersion = financeRecognitionInteger(input.expectedCertificateVersion);
  const supersedesCertificateId = nullableUuid(input.supersedesCertificateId);
  certificateReference(supersedesCertificateId, expectedCertificateVersion);
  const effectiveCheckInOn = financeRecognitionDate(input.effectiveCheckInOn);
  const effectiveCheckOutOn = nullableDate(input.effectiveCheckOutOn);
  if (effectiveCheckOutOn !== null && effectiveCheckOutOn <= effectiveCheckInOn) throw new FinanceInputError('La salida efectiva debe ser posterior al ingreso.');
  return {
    bookingId: parseFinanceUuid(input.bookingId), expectedBookingUpdatedAt: financeRecognitionInstant(input.expectedBookingUpdatedAt),
    expectedCertificateVersion, expectedPricingSourceId: parseFinanceUuid(input.expectedPricingSourceId),
    servedNights: servedNights(input.servedNights, expectedCertificateVersion), effectiveCheckInOn, effectiveCheckOutOn,
    evidence: financeRecognitionText(input.evidence), reason: financeRecognitionText(input.reason), supersedesCertificateId,
  };
}

function terminalCoverage(value: unknown): 'COMPLETE' | 'DECLARED_NONE' {
  if (value !== 'COMPLETE' && value !== 'DECLARED_NONE') throw new FinanceInputError('La cobertura debe ser COMPLETE o DECLARED_NONE.');
  return value;
}

export function parseFinanceTerminalRecognitionCommand(value: unknown): FinanceTerminalRecognitionCommand {
  const input = financeRecognitionStrict(value, ['bookingId', 'expectedBookingUpdatedAt', 'expectedVersion', 'expectedPricingRevisionId', 'serviceCertificateId', 'serviceCertificateVersion', 'recognitionOn', 'confirmedNonServiceAmountMinor', 'coverage', 'classification', 'reason']);
  const serviceCertificateId = nullableUuid(input.serviceCertificateId);
  const serviceCertificateVersion = financeRecognitionInteger(input.serviceCertificateVersion);
  certificateReference(serviceCertificateId, serviceCertificateVersion);
  return {
    bookingId: parseFinanceUuid(input.bookingId), expectedBookingUpdatedAt: financeRecognitionInstant(input.expectedBookingUpdatedAt),
    expectedVersion: financeRecognitionInteger(input.expectedVersion), expectedPricingRevisionId: parseFinanceUuid(input.expectedPricingRevisionId),
    serviceCertificateId, serviceCertificateVersion, recognitionOn: financeRecognitionDate(input.recognitionOn),
    confirmedNonServiceAmountMinor: financeRecognitionInteger(input.confirmedNonServiceAmountMinor), coverage: terminalCoverage(input.coverage),
    classification: financeRecognitionText(input.classification), reason: financeRecognitionText(input.reason),
  };
}

export function parseFinanceProfitabilityQuery(value: unknown): FinanceProfitabilityQuery {
  const input = financeRecognitionStrict(value, ['from', 'to', 'token']);
  const from = financeRecognitionDate(input.from); const to = financeRecognitionDate(input.to);
  const days = (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000;
  if (days < 1 || days > 366) throw new FinanceInputError('El período [from,to) requiere de 1 a 366 días.');
  return input.token === undefined ? { from, to } : { from, to, expectedSourceToken: financeRecognitionToken(input.token) };
}

export function parseFinanceBookingResultQuery(value: unknown): FinanceBookingResultQuery {
  const input = financeRecognitionStrict(value, ['from', 'to', 'asOf', 'token']);
  const query = parseFinanceProfitabilityQuery({ from: input.from, to: input.to, ...(input.token === undefined ? {} : { token: input.token }) });
  if (input.asOf === undefined) return query;
  if (typeof input.asOf !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{3})?(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(input.asOf)) throw new FinanceInputError('Se requiere un instante ISO con zona horaria explícita.');
  financeRecognitionDate(input.asOf.slice(0, 10));
  if (Number(input.asOf.slice(11, 13)) > 23) throw new FinanceInputError('La hora del corte no existe.');
  const asOf = new Date(input.asOf);
  if (!Number.isFinite(asOf.getTime())) throw new FinanceInputError('El corte no existe.');
  return { ...query, asOf: asOf.toISOString() };
}
