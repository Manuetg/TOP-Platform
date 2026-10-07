import { createHash } from 'node:crypto';
import type { AmendmentFinancialSummary, AmendmentQuote } from '../booking-amendment.contract';

export function canonicalAmendmentJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalAmendmentJson).join(',') + ']';
  if (typeof value === 'object' && value !== null) {
    const record = value as Record<string, unknown>;
    return '{' + Object.keys(record).sort().map((key) => JSON.stringify(key) + ':' + canonicalAmendmentJson(record[key])).join(',') + '}';
  }
  return JSON.stringify(value) ?? 'null';
}

export function amendmentQuote(price: Omit<AmendmentQuote, 'fingerprint'>, context: unknown): AmendmentQuote {
  const fingerprint = createHash('sha256').update(canonicalAmendmentJson({ context, price })).digest('hex');
  return { ...price, fingerprint };
}

export function amendmentFinancialSummary(totalAmountMinor: number, paidAmountMinor: number): Pick<AmendmentFinancialSummary, 'totalAmountMinor' | 'paidAmountMinor' | 'outstandingAmountMinor' | 'creditAmountMinor'> {
  return { totalAmountMinor, paidAmountMinor, outstandingAmountMinor: Math.max(totalAmountMinor - paidAmountMinor, 0), creditAmountMinor: Math.max(paidAmountMinor - totalAmountMinor, 0) };
}
