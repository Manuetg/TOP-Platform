import { safeMoney } from '../domain/finance-money';
import { evidenceText, evidenceUuid, FinanceEvidenceError, requireSignedCapacity } from './finance-v2-evidence.validation';
import type { BankMatchComponentInput, BankMatchInput, BankMatchSnapshot, BankResidual, BankSourceForeignKeys, BankSourceSnapshot, BankSuggestion, BankValidatedComponent } from './finance-v2-bank.types';

export function bankSourceKey(source: Pick<BankMatchComponentInput, 'sourceType' | 'sourceId' | 'sourceLeg'>): string {
  return `${source.sourceType}:${source.sourceId}:${source.sourceLeg ?? ''}`;
}
function sourceKind(source: BankMatchComponentInput): void {
  if (!['PAYMENT', 'REFUND', 'SETTLEMENT', 'TRANSFER', 'MOVEMENT'].includes(source.sourceType)) throw new FinanceEvidenceError('SOURCE_TYPE_INVALID', 'sourceType');
  evidenceUuid(source.sourceId, 'sourceId');
  if (source.sourceType === 'TRANSFER') {
    if (source.sourceLeg !== 'FROM' && source.sourceLeg !== 'TO') throw new FinanceEvidenceError('TRANSFER_LEG_REQUIRED', 'sourceLeg');
  } else if (source.sourceLeg !== null) throw new FinanceEvidenceError('SOURCE_LEG_INVALID', 'sourceLeg');
  if (!/^[0-9a-f]{64}$/.test(source.sourceHash)) throw new FinanceEvidenceError('SOURCE_HASH_INVALID', 'sourceHash');
}
function signedKind(source: BankMatchComponentInput): void {
  const positive = source.sourceType === 'PAYMENT' || (source.sourceType === 'TRANSFER' && source.sourceLeg === 'TO');
  const negative = source.sourceType === 'REFUND' || source.sourceType === 'SETTLEMENT' || (source.sourceType === 'TRANSFER' && source.sourceLeg === 'FROM');
  if ((positive && source.amountMinor <= 0) || (negative && source.amountMinor >= 0)) throw new FinanceEvidenceError('SOURCE_SIGN_INVALID', 'amountMinor');
}
function sourceAccount(source: BankSourceSnapshot, input: BankMatchInput): void {
  if (source.accountId === input.accountId) return;
  if (source.accountId !== null || source.sourceType !== 'PAYMENT') throw new FinanceEvidenceError('SOURCE_ACCOUNT_MISMATCH', 'accountId');
  const link = input.paymentLinks.find(item => item.paymentId === source.sourceId);
  if (!link || link.accountId !== input.accountId || link.expectedLinkVersion !== (source.linkVersion ?? 0)) throw new FinanceEvidenceError('PAYMENT_LINK_REQUIRED', 'paymentLinks');
  evidenceText(link.reason, 'reason', 500);
}
export function bankSourceForeignKeys(source: BankMatchComponentInput): BankSourceForeignKeys {
  sourceKind(source);
  return { paymentId: source.sourceType === 'PAYMENT' ? source.sourceId : null, paymentAdjustmentId: source.sourceType === 'REFUND' ? source.sourceId : null, settlementId: source.sourceType === 'SETTLEMENT' ? source.sourceId : null, transferId: source.sourceType === 'TRANSFER' ? source.sourceId : null, cashMovementId: source.sourceType === 'MOVEMENT' ? source.sourceId : null };
}
export function requireBankSourceFlow(source: BankMatchComponentInput): void {
  sourceKind(source);
  signedKind(source);
  if (!Number.isSafeInteger(source.amountMinor) || source.amountMinor === 0 || !Number.isSafeInteger(source.sourceVersion) || source.sourceVersion < 1) throw new FinanceEvidenceError('SOURCE_VALUE_INVALID');
}
export function validateBankComponent(component: BankMatchComponentInput, input: BankMatchInput, snapshot: BankMatchSnapshot): { component: BankValidatedComponent; source: BankSourceSnapshot } {
  sourceKind(component);
  signedKind(component);
  const sourceKey = bankSourceKey(component);
  const source = snapshot.sources.find(item => item.businessId === input.businessId && bankSourceKey(item) === sourceKey);
  if (!source) throw new FinanceEvidenceError('SOURCE_NOT_FOUND', 'sourceId');
  if (!source.eligible) throw new FinanceEvidenceError('SOURCE_INELIGIBLE', 'sourceId');
  if (source.currency !== 'PYG') throw new FinanceEvidenceError('CURRENCY_INVALID', 'sourceId');
  if (!Number.isSafeInteger(component.sourceVersion) || component.sourceVersion < 1 || source.sourceVersion !== component.sourceVersion || source.sourceHash !== component.sourceHash) throw new FinanceEvidenceError('SOURCE_STALE', 'sourceVersion');
  sourceAccount(source, input);
  requireSignedCapacity(component.amountMinor, source.amountMinor, source.reservedMinor);
  return { component: { ...component, ...bankSourceForeignKeys(component), sourceKey, accountId: input.accountId }, source };
}
export function bankResidual(key: string, capacity: number, reservedMinor: number, consumedMinor: number): BankResidual {
  const residualMinor = safeMoney(BigInt(capacity) - BigInt(Math.sign(capacity)) * (BigInt(reservedMinor) + BigInt(Math.abs(consumedMinor))));
  return { key, amountMinor: capacity, reservedMinor, consumedMinor, residualMinor, status: residualMinor === 0 ? 'MATCHED' : 'PARTIAL' };
}
export function validateBankPaymentLinks(input: BankMatchInput, snapshot: BankMatchSnapshot): void {
  const ids = new Set<string>();
  for (const link of input.paymentLinks) {
    evidenceUuid(link.paymentId, 'paymentId');
    if (ids.has(link.paymentId)) throw new FinanceEvidenceError('PAYMENT_LINK_DUPLICATE', 'paymentLinks');
    ids.add(link.paymentId);
    const source = snapshot.sources.find(item => item.businessId === input.businessId && item.sourceType === 'PAYMENT' && item.sourceId === link.paymentId);
    if (!source || source.accountId !== null || !input.components.some(item => item.sourceType === 'PAYMENT' && item.sourceId === link.paymentId)) throw new FinanceEvidenceError('PAYMENT_LINK_NOT_APPLICABLE', 'paymentLinks');
    if (!Number.isSafeInteger(link.expectedLinkVersion) || link.expectedLinkVersion < 0) throw new FinanceEvidenceError('PAYMENT_LINK_VERSION_INVALID', 'paymentLinks');
  }
}
function availableAmount(amountMinor: number, reservedMinor: number): number | null {
  if (!Number.isSafeInteger(amountMinor) || !Number.isSafeInteger(reservedMinor) || reservedMinor < 0 || reservedMinor > Math.abs(amountMinor)) return null;
  return amountMinor - Math.sign(amountMinor) * reservedMinor;
}
function suggestionsForRow(row: BankMatchSnapshot['rows'][number], snapshot: BankMatchSnapshot): BankSuggestion[] {
  const suggestions: BankSuggestion[] = [];
  const available = availableAmount(row.amountMinor, row.reservedMinor);
  if (!available) return suggestions;
  for (const source of snapshot.sources) {
    if (!suggestionSourceEligible(source, row.accountId, snapshot.businessId)) continue;
    if (available !== availableAmount(source.amountMinor, source.reservedMinor)) continue;
    const reasons: BankSuggestion['reasons'][number][] = ['EXACT_AMOUNT'];
    if (row.bookedOn === source.bookedOn) reasons.push('EXACT_DATE');
    if (row.reference && source.reference === row.reference) reasons.push('EXACT_REFERENCE');
    suggestions.push({ bankRowId: row.id, sourceKey: bankSourceKey(source), amountMinor: available, reasons, confirmation: 'REQUIRES_EXPLICIT_COMMAND' });
  }
  return suggestions;
}
function suggestionSourceEligible(source: BankSourceSnapshot, accountId: string, businessId: string): boolean {
  return source.businessId === businessId && source.accountId === accountId && source.eligible && source.currency === 'PYG';
}
export function suggestBankMatches(snapshot: BankMatchSnapshot): BankSuggestion[] {
  const suggestions = snapshot.rows.filter(row => row.businessId === snapshot.businessId && row.accountId === snapshot.account.id).flatMap(row => suggestionsForRow(row, snapshot));
  return suggestions.sort((a, b) => a.bankRowId.localeCompare(b.bankRowId) || a.sourceKey.localeCompare(b.sourceKey));
}
