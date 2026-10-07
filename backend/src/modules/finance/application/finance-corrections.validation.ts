import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceUuid } from '../domain/finance-validation';
import type { FinanceCorrectionConcurrency, FinancePaymentAdjustmentCommand, FinanceTerminalPricingCommand } from '../domain/finance-corrections.types';

type Input = Record<string, unknown>;
const commonFields = ['type', 'bookingId', 'expectedBookingUpdatedAt', 'currentPricingId', 'expectedFinancialVersion', 'reason'];

function strictInput(value: unknown, fields: string[]): Input {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new FinanceInputError('Se requiere un comando de corrección.');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) throw new FinanceInputError('El comando debe ser un objeto simple.');
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string' || !fields.includes(key))) throw new FinanceInputError('El comando contiene campos no admitidos.');
  return value as Input;
}

function money(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new FinanceInputError(`Se requiere un entero seguro mayor o igual a ${minimum}.`);
  return value;
}

function text(value: unknown, minimum: number, maximum: number): string {
  if (typeof value !== 'string') throw new FinanceInputError('Se requiere texto explícito.');
  const result = value.trim();
  if (result.length < minimum || result.length > maximum || Array.from(result).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) throw new FinanceInputError('El texto tiene longitud o caracteres no admitidos.');
  return result;
}

function instant(value: unknown): string {
  if (typeof value !== 'string') throw new FinanceInputError('Se requiere un instante ISO con offset.');
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new FinanceInputError('El instante debe incluir offset y precisión de milisegundos.');
  requireCalendarAndClock(match);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || !/^\d{4}-/.test(date.toISOString()) || date.toISOString().startsWith('0000-')) throw new FinanceInputError('El instante queda fuera del calendario admitido.');
  return date.toISOString();
}

function requireCalendarAndClock(match: RegExpExecArray): void {
  const calendar = new Date(`${match[1]}T00:00:00.000Z`);
  if (!Number.isFinite(calendar.getTime()) || calendar.toISOString().slice(0, 10) !== match[1] || match[1].startsWith('0000-')) throw new FinanceInputError('La fecha ISO no existe.');
  if (Number(match[2]) > 23 || Number(match[3]) > 59 || Number(match[4]) > 59) throw new FinanceInputError('La hora ISO no existe.');
  if (match[5] !== 'Z' && (Number(match[5].slice(1, 3)) > 23 || Number(match[5].slice(4, 6)) > 59)) throw new FinanceInputError('El offset ISO no existe.');
}

function concurrency(input: Input): FinanceCorrectionConcurrency {
  return { bookingId: parseFinanceUuid(input.bookingId), expectedBookingUpdatedAt: instant(input.expectedBookingUpdatedAt), currentPricingId: parseFinanceUuid(input.currentPricingId), expectedFinancialVersion: money(input.expectedFinancialVersion, 0), reason: text(input.reason, 2, 500) };
}

export function parsePaymentAdjustmentCommand(value: unknown): FinancePaymentAdjustmentCommand {
  const discriminator = strictInput(value, [...commonFields, 'paymentId', 'expectedPaymentVersion', 'amountMinor', 'occurredAt', 'accountId', 'expectedAccountVersion', 'reference']).type;
  if (discriminator === 'VOID_PAYMENT') {
    const input = strictInput(value, [...commonFields, 'paymentId', 'expectedPaymentVersion']);
    return { ...concurrency(input), type: discriminator, paymentId: parseFinanceUuid(input.paymentId), expectedPaymentVersion: money(input.expectedPaymentVersion, 1) };
  }
  if (discriminator !== 'REFUND_PAYMENT') throw new FinanceInputError('El tipo de ajuste de cobro no está admitido.');
  const input = value as Input;
  return { ...concurrency(input), type: discriminator, paymentId: parseFinanceUuid(input.paymentId), expectedPaymentVersion: money(input.expectedPaymentVersion, 1), amountMinor: money(input.amountMinor, 1), occurredAt: instant(input.occurredAt), accountId: parseFinanceUuid(input.accountId), expectedAccountVersion: money(input.expectedAccountVersion, 1), reference: input.reference === null ? null : text(input.reference, 0, 120) || null };
}

export function parseTerminalPricingCommand(value: unknown): FinanceTerminalPricingCommand {
  const input = strictInput(value, [...commonFields, 'finalAmountMinor']);
  if (input.type !== 'SET_TERMINAL_FINAL_AMOUNT') throw new FinanceInputError('El tipo de acuerdo final no está admitido.');
  return { ...concurrency(input), type: input.type, finalAmountMinor: money(input.finalAmountMinor, 0) };
}
