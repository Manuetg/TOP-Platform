import { safeMoney } from '../domain/finance-money';
import { FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { evidenceDigest } from '../application/finance-v2-evidence.validation';
import type { BankSourceSnapshot } from '../application/finance-v2-bank.types';
import type { FinanceBankPublicSourceReader } from './finance-v2-bank.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';

export interface FinancePublicPaymentMoneySource {
  sourceType: 'PAYMENT' | 'REFUND'; sourceId: string; paymentId: string; bookingId: string;
  paymentVersion: number; version: number; amountMinorSigned: number; currency: string;
  occurredAt: string; accountId: string | null; reference: string | null;
}
export interface FinancePublicPaymentMoneyReader {
  // Root binds this to Payment's public readPaymentMoneySourcesForFinance.
  // The adapter passes the exact transaction through; it never queries Payment's private tables.
  moneySources(tx: FinanceSqlTransaction, businessId: string): Promise<readonly FinancePublicPaymentMoneySource[]>;
}
type ReadSource = BankSourceSnapshot & { description: string };
interface LinkRow { paymentId: string; accountId: string; version: number }
interface OwnMoneyRow { id: string; accountId: string; amountMinor: bigint | string; occurredAt: Date | string; reference: string | null; description: string; kind?: string }
interface TransferRow { id: string; fromAccountId: string; toAccountId: string; amountMinor: bigint | string; occurredAt: Date | string; reason: string }
export class FinanceBankSqlSourceReader implements FinanceBankPublicSourceReader {
  constructor(private readonly payments: FinancePublicPaymentMoneyReader) {}
  async load(tx: FinanceSqlTransaction, businessId: string, accountId: string): Promise<readonly ReadSource[]> {
    const businesses = await tx.query<{ timezone: string }>('SELECT timezone FROM "Business" WHERE id=$1', [businessId]);
    if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
    const timeZone = businesses[0].timezone;
    const paymentRows = await this.payments.moneySources(tx, businessId);
    if (paymentRows.length > 5000) throw new FinanceInputError('BANK_SOURCE_LIMIT_EXCEEDED');
    const links = await tx.query<LinkRow>('SELECT "paymentId","accountId",version FROM "FinancePaymentLink" WHERE "businessId"=$1 AND "paymentId"=ANY($2::text[])', [businessId, paymentRows.filter(payment => payment.sourceType === 'PAYMENT').map(payment => payment.paymentId)]);
    const result = paymentSources(paymentRows, links, businessId, accountId, timeZone);
    const settlements = await tx.query<OwnMoneyRow>('SELECT s.id,s."accountId",s."amountMinor",s."occurredAt",s.reference,e.description FROM "FinanceSettlement" s JOIN "FinanceExpense" e ON e.id=s."expenseId" AND e."businessId"=s."businessId" WHERE s."businessId"=$1 AND s."accountId"=$2 ORDER BY s.id LIMIT 5001', [businessId, accountId]);
    result.push(...settlements.map(row => ownSource(row, 'SETTLEMENT', -safeMoney(BigInt(row.amountMinor)), businessId, timeZone)));
    const movements = await tx.query<OwnMoneyRow>('SELECT id,"accountId","amountMinor","occurredAt",NULL::text AS reference,reason AS description,kind FROM "FinanceCashMovement" WHERE "businessId"=$1 AND "accountId"=$2 ORDER BY id LIMIT 5001', [businessId, accountId]);
    result.push(...movements.map(row => ownSource(row, 'MOVEMENT', movementAmount(row), businessId, timeZone)));
    const transfers = await tx.query<TransferRow>('SELECT id,"fromAccountId","toAccountId","amountMinor","occurredAt",reason FROM "FinanceTransfer" WHERE "businessId"=$1 AND ("fromAccountId"=$2 OR "toAccountId"=$2) ORDER BY id LIMIT 5001', [businessId, accountId]);
    result.push(...transfers.flatMap(row => transferSources(row, businessId, accountId, timeZone)));
    if (result.length > 5000 || [settlements, movements, transfers].some(rows => rows.length > 5000)) throw new FinanceInputError('BANK_SOURCE_LIMIT_EXCEEDED');
    return result;
  }
}
function baseSource(sourceId: string, sourceType: BankSourceSnapshot['sourceType'], amountMinor: number, occurredAt: string, accountId: string | null, businessId: string, timeZone: string): BankSourceSnapshot {
  if (!Number.isSafeInteger(amountMinor) || amountMinor === 0) throw new FinanceInputError('BANK_SOURCE_AMOUNT_INVALID');
  return { sourceId, sourceType, sourceLeg: null, sourceVersion: 1, sourceHash: '', amountMinor, occurredAt, bookedOn: bankLocalDate(occurredAt, timeZone), accountId, businessId, currency: 'PYG', reference: null, reservedMinor: 0, eligible: true, linkVersion: null };
}
function paymentSources(payments: readonly FinancePublicPaymentMoneySource[], links: readonly LinkRow[], businessId: string, accountId: string, timeZone: string): ReadSource[] {
  const result: ReadSource[] = [];
  for (const payment of payments) {
    requirePaymentSource(payment);
    const scope = linkedSourceAccount(payment, links);
    if (scope.accountId !== null && scope.accountId !== accountId) continue;
    const source = baseSource(payment.sourceId, payment.sourceType, payment.amountMinorSigned, sqlInstant(payment.occurredAt), scope.accountId, businessId, timeZone);
    result.push({ ...source, reference: payment.reference, sourceVersion: payment.version, sourceHash: evidenceDigest({ payment, link: scope.link }), linkVersion: scope.link?.version ?? null, description: payment.sourceType === 'PAYMENT' ? 'Cobro registrado de reserva' : 'Devolución registrada de reserva' });
  }
  return result;
}
function linkedSourceAccount(source: FinancePublicPaymentMoneySource, links: readonly LinkRow[]): { accountId: string | null; link: LinkRow | null } {
  if (source.sourceType === 'REFUND') return { accountId: source.accountId, link: null };
  const link = links.find(item => item.paymentId === source.paymentId) ?? null;
  return { accountId: link ? link.accountId : null, link };
}
function ownSource(row: OwnMoneyRow, type: 'SETTLEMENT' | 'MOVEMENT', amountMinor: number, businessId: string, timeZone: string): ReadSource {
  const source = baseSource(row.id, type, amountMinor, sqlInstant(row.occurredAt), row.accountId, businessId, timeZone);
  return { ...source, reference: row.reference, sourceHash: evidenceDigest({ id: row.id, type, accountId: row.accountId, amountMinor, occurredAt: source.occurredAt, reference: row.reference, kind: row.kind ?? null }), description: row.description };
}
function movementAmount(row: OwnMoneyRow): number {
  const amount = safeMoney(BigInt(row.amountMinor));
  if (row.kind === 'ADJUSTMENT') return amount;
  if (row.kind === 'WITHDRAWAL') {
    if (amount >= 0) throw new FinanceInputError('BANK_MOVEMENT_SOURCE_INVALID');
    return amount;
  }
  if (!['CONTRIBUTION', 'FINANCING'].includes(row.kind ?? '') || amount <= 0) throw new FinanceInputError('BANK_MOVEMENT_SOURCE_INVALID');
  return amount;
}
function transferSources(row: TransferRow, businessId: string, accountId: string, timeZone: string): ReadSource[] {
  const amount = safeMoney(BigInt(row.amountMinor));
  if (amount <= 0 || row.fromAccountId === row.toAccountId) throw new FinanceInputError('BANK_TRANSFER_SOURCE_INVALID');
  const leg = row.fromAccountId === accountId ? 'FROM' as const : 'TO' as const;
  const source = baseSource(row.id, 'TRANSFER', leg === 'FROM' ? -amount : amount, sqlInstant(row.occurredAt), accountId, businessId, timeZone);
  return [{ ...source, sourceLeg: leg, sourceHash: evidenceDigest({ id: row.id, from: row.fromAccountId, to: row.toAccountId, amount, occurredAt: source.occurredAt, leg }), description: row.reason }];
}
function requirePaymentSource(source: FinancePublicPaymentMoneySource): void {
  if (source.currency !== 'PYG' || !Number.isSafeInteger(source.amountMinorSigned) || source.amountMinorSigned === 0 || !Number.isSafeInteger(source.version) || source.version < 1) throw new FinanceInputError('BANK_PAYMENT_SOURCE_INVALID');
  requirePaymentSign(source);
}
function requirePaymentSign(source: FinancePublicPaymentMoneySource): void {
  if (source.sourceType !== 'PAYMENT' && source.sourceType !== 'REFUND') throw new FinanceInputError('BANK_PAYMENT_SOURCE_INVALID');
  if (source.sourceType === 'PAYMENT' && source.amountMinorSigned < 0) throw new FinanceInputError('BANK_PAYMENT_SOURCE_INVALID');
  if (source.sourceType === 'REFUND' && (source.amountMinorSigned > 0 || source.accountId === null)) throw new FinanceInputError('BANK_REFUND_SOURCE_INVALID');
}
export function sqlInstant(value: Date | string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new FinanceInputError('BANK_SOURCE_DATE_INVALID');
  return parsed.toISOString();
}
export function bankLocalDate(occurredAt: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(occurredAt));
  const part = (type: string): string => parts.find(item => item.type === type)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
