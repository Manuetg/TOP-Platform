import { createHash } from 'node:crypto';
import { parseFinanceUuid } from '../domain/finance-validation';
import { safeMoney } from '../domain/finance-money';

export interface EvidenceIssue { ordinal: number; column: string; code: string }
export class FinanceEvidenceError extends Error {
  constructor(public readonly code: string, public readonly column = 'csv', public readonly ordinal = 0) {
    super(code);
    this.name = 'FinanceEvidenceError';
  }
}
export function issue(error: unknown, ordinal = 0): EvidenceIssue {
  if (error instanceof FinanceEvidenceError) return { ordinal: error.ordinal || ordinal, column: error.column, code: error.code };
  return { ordinal, column: 'amountMinor', code: 'MONEY_RANGE_INVALID' };
}
export function evidenceText(value: string, column: string, maximum: number): string {
  const text = value.trim();
  const controls = Array.from(text).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!text || text.length > maximum || controls) throw new FinanceEvidenceError('TEXT_INVALID', column);
  return text;
}
export function evidenceUuid(value: string, column: string): string {
  try { return parseFinanceUuid(value); } catch { throw new FinanceEvidenceError('UUID_INVALID', column); }
}
export function evidenceMoney(value: string, column: string, minimum: number): number {
  if (!/^-?(0|[1-9]\d*)$/.test(value)) throw new FinanceEvidenceError('MONEY_INVALID', column);
  let result: number;
  try { result = safeMoney(BigInt(value)); } catch { throw new FinanceEvidenceError('MONEY_RANGE_INVALID', column); }
  if (result < minimum) throw new FinanceEvidenceError('MONEY_INVALID', column);
  return result;
}
export function evidenceBoolean(value: string, column: string): boolean {
  if (value !== 'true' && value !== 'false') throw new FinanceEvidenceError('BOOLEAN_INVALID', column);
  return value === 'true';
}
export function evidenceDate(value: string, column: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) throw new FinanceEvidenceError('DATE_INVALID', column);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new FinanceEvidenceError('DATE_INVALID', column);
  return value;
}
export function evidenceInstant(value: string, column: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new FinanceEvidenceError('INSTANT_INVALID', column);
  evidenceDate(match[1], column);
  if ([match[2], match[3], match[4]].some((part, index) => Number(part) > [23, 59, 59][index])) throw new FinanceEvidenceError('INSTANT_INVALID', column);
  const offset = match[5];
  if (offset !== 'Z' && (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59)) throw new FinanceEvidenceError('INSTANT_INVALID', column);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new FinanceEvidenceError('INSTANT_INVALID', column);
  const result = date.toISOString();
  if (!/^\d{4}-/.test(result) || result.startsWith('0000-')) throw new FinanceEvidenceError('INSTANT_INVALID', column);
  return result;
}
export function optional<T>(value: string, parser: (text: string) => T): T | null { return value === '' ? null : parser(value); }
export function evidenceDigest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
export function safeDifference(total: number, used: number): number { return safeMoney(BigInt(total) - BigInt(used)); }
export function requireSignedCapacity(amount: number, capacity: number, reserved: number): void {
  if (![amount, capacity, reserved].every(Number.isSafeInteger) || amount === 0 || capacity === 0 || reserved < 0) throw new FinanceEvidenceError('CAPACITY_INVALID');
  if (Math.sign(amount) !== Math.sign(capacity)) throw new FinanceEvidenceError('SIGN_MISMATCH');
  if (BigInt(Math.abs(amount)) + BigInt(reserved) > BigInt(Math.abs(capacity))) throw new FinanceEvidenceError('CAPACITY_EXCEEDED');
}
export function requireEvidenceBankAccount(account: { id: string; businessId: string; kind: string; currency: string; archived: boolean }, businessId: string, accountId: string): void {
  if (account.businessId !== businessId || account.id !== accountId) throw new FinanceEvidenceError('REFERENCE_NOT_FOUND', 'accountId');
  if (account.kind !== 'BANK' || account.currency !== 'PYG' || account.archived) throw new FinanceEvidenceError('BANK_ACCOUNT_REQUIRED', 'accountId');
}
