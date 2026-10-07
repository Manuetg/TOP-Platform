import { FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import type { BankComponentRef, FinanceBankMatchSourceDto } from '../domain/finance-v2.types';
import { bankSourceKey, requireBankSourceFlow } from '../application/finance-v2-bank-source';
import { evidenceInstant, evidenceUuid, FinanceEvidenceError } from '../application/finance-v2-evidence.validation';
import type { BankSourceSnapshot } from '../application/finance-v2-bank.types';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { StoredStatement } from './finance-v2-import-bank.sql-store';

export interface FinanceBankReadHost {
  // Adapter must open RepeatableRead; no sources are fetched outside this transaction.
  read<T>(work: (tx: FinanceSqlTransaction) => Promise<T>): Promise<T>;
}
export interface FinanceBankPublicSourceReader {
  // Payment supplies gross PAYMENT and separate effective REFUND; VOID originals return eligible:false.
  load(tx: FinanceSqlTransaction, businessId: string, accountId: string): Promise<readonly (BankSourceSnapshot & { description: string })[]>;
}
export type FinanceBankAvailableSource = FinanceBankMatchSourceDto;
export interface FinanceBankReadActor { businessId: string; actorUserId: string; accountId: string }
export interface BankReadCursor { createdAt: string; id: string }
export interface BankReadPageInput extends FinanceBankReadActor { cursor: BankReadCursor | null; limit: number }
export interface BankReadPage<T> { items: T[]; nextCursor: BankReadCursor | null }
export interface BankStatementReadRow { id: string; accountId: string; sourceNamespace: string; canonicalDigest: string; formatVersion: string; createdAt: string; loadedAt: string; result: StoredStatement }
export interface BankMatchReadRow { id: string; accountId: string; version: number; state: 'ACTIVE' | 'CANCELLED'; reason: string; createdAt: string; cancelledAt: string | null; cancelReason: string | null }
interface ReservationRow { sourceType: BankSourceSnapshot['sourceType']; sourceId: string; sourceLeg: BankSourceSnapshot['sourceLeg']; amount: bigint | string }

export class FinanceBankReadService {
  constructor(private readonly host: FinanceBankReadHost, private readonly sources: FinanceBankPublicSourceReader) {}
  availableSources(input: FinanceBankReadActor): Promise<FinanceBankAvailableSource[]> {
    return this.host.read(async tx => {
      await this.authorize(tx, input);
      const sources = await this.sources.load(tx, input.businessId, input.accountId);
      if (sources.length > 5000) throw new FinanceInputError('BANK_SOURCE_LIMIT_EXCEEDED');
      const reservations = await readActiveBankSourceReservations(tx, input.businessId);
      const keys = new Set<string>();
      const rows: FinanceBankAvailableSource[] = [];
      for (const source of sources) {
        if (!eligibleAccount(source, input)) continue;
        const key = bankSourceKey(source);
        if (keys.has(key)) throw new FinanceInputError('BANK_SOURCE_DUPLICATE');
        keys.add(key);
        const reserved = reservations.get(key) ?? 0;
        rows.push(availableSource(source, reserved));
      }
      return rows.sort((a, b) => bankSourceKey(a.ref).localeCompare(bankSourceKey(b.ref)));
    });
  }
  statements(input: BankReadPageInput): Promise<BankReadPage<BankStatementReadRow>> {
    return this.host.read(async tx => {
      await this.authorize(tx, input);
      requirePage(input);
      const rows = await tx.query<BankStatementReadRow>('SELECT id,"accountId","sourceNamespace","canonicalDigest","formatVersion","createdAt"::text AS "createdAt","loadedAt"::text AS "loadedAt",result FROM "FinanceBankStatement" WHERE "businessId"=$1 AND "accountId"=$2 AND ($3::timestamptz IS NULL OR ("createdAt",id)<($3::timestamptz,$4::text)) ORDER BY "createdAt" DESC,id DESC LIMIT $5', [input.businessId, input.accountId, input.cursor?.createdAt ?? null, input.cursor?.id ?? null, input.limit + 1]);
      return page(rows, input.limit);
    });
  }
  matches(input: BankReadPageInput): Promise<BankReadPage<BankMatchReadRow>> {
    return this.host.read(async tx => {
      await this.authorize(tx, input);
      requirePage(input);
      const rows = await tx.query<BankMatchReadRow>('SELECT id,"accountId",version,state,reason,"createdAt"::text AS "createdAt","cancelledAt"::text AS "cancelledAt","cancelReason" FROM "FinanceBankMatch" WHERE "businessId"=$1 AND "accountId"=$2 AND ($3::timestamptz IS NULL OR ("createdAt",id)<($3::timestamptz,$4::text)) ORDER BY "createdAt" DESC,id DESC LIMIT $5', [input.businessId, input.accountId, input.cursor?.createdAt ?? null, input.cursor?.id ?? null, input.limit + 1]);
      return page(rows, input.limit);
    });
  }
  private async authorize(tx: FinanceSqlTransaction, input: FinanceBankReadActor): Promise<void> {
    evidenceUuid(input.businessId, 'businessId'); evidenceUuid(input.actorUserId, 'actorUserId'); evidenceUuid(input.accountId, 'accountId');
    const actors = await tx.query<{ status: string; role: string }>('SELECT u.status,m.role FROM "User" u JOIN "UserBusinessMembership" m ON m."userId"=u.id WHERE u.id=$1 AND m."businessId"=$2', [input.actorUserId, input.businessId]);
    if (actors[0]?.status !== 'ACTIVE' || actors[0].role !== 'OWNER') throw new FinanceForbiddenError('Acceso financiero no autorizado.');
    const accounts = await tx.query<{ id: string; kind: string; currency: string }>('SELECT a.id,a.kind,b.currency FROM "FinanceAccount" a JOIN "Business" b ON b.id=a."businessId" WHERE a."businessId"=$1 AND a.id=$2', [input.businessId, input.accountId]);
    if (!accounts[0]) throw new FinanceNotFoundError('Cuenta no disponible.');
    if (accounts[0].kind !== 'BANK' || accounts[0].currency !== 'PYG') throw new FinanceInputError('BANK_ACCOUNT_REQUIRED');
  }
}
function eligibleAccount(source: BankSourceSnapshot, input: FinanceBankReadActor): boolean {
  if (source.businessId !== input.businessId || !source.eligible || source.currency !== 'PYG') return false;
  return source.accountId === input.accountId || (source.sourceType === 'PAYMENT' && source.accountId === null);
}
function availableSource(source: BankSourceSnapshot & { description: string }, reserved: number): FinanceBankAvailableSource {
  requireBankSourceFlow(source);
  if (!Number.isSafeInteger(source.amountMinor) || source.amountMinor === 0 || reserved < 0 || reserved > Math.abs(source.amountMinor)) throw new FinanceEvidenceError('BANK_SOURCE_CAPACITY_INVALID');
  const residualMinor = safeMoney(BigInt(source.amountMinor) - BigInt(Math.sign(source.amountMinor)) * BigInt(reserved));
  return { ref: sourceRef(source), sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor: source.amountMinor, residualMinor, description: source.description, occurredAt: source.occurredAt, accountId: source.accountId, needsAccountLink: source.accountId === null };
}
function sourceRef(source: BankSourceSnapshot): BankComponentRef {
  if (source.sourceType === 'TRANSFER') {
    if (source.sourceLeg !== 'FROM' && source.sourceLeg !== 'TO') throw new FinanceEvidenceError('TRANSFER_LEG_REQUIRED');
    return { sourceType: 'TRANSFER', sourceId: source.sourceId, sourceLeg: source.sourceLeg };
  }
  return { sourceType: source.sourceType, sourceId: source.sourceId, sourceLeg: null };
}
function requirePage(input: BankReadPageInput): void {
  if (!Number.isSafeInteger(input.limit) || input.limit < 1 || input.limit > 100) throw new FinanceInputError('BANK_PAGE_LIMIT_INVALID');
  if (input.cursor) { evidenceInstant(input.cursor.createdAt, 'cursor.createdAt'); evidenceUuid(input.cursor.id, 'cursor.id'); }
}
function page<T extends { createdAt: string; id: string }>(rows: T[], limit: number): BankReadPage<T> {
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? { createdAt: last.createdAt, id: last.id } : null };
}
export async function readActiveBankSourceReservations(tx: FinanceSqlTransaction, businessId: string): Promise<Map<string, number>> {
  const rows = await tx.query<ReservationRow>('SELECT c."sourceType",COALESCE(c."paymentId",c."paymentAdjustmentId",c."settlementId",c."transferId",c."cashMovementId") AS "sourceId",c."sourceLeg",SUM(ABS(c."amountMinor")) AS amount FROM "FinanceBankMatchComponent" c JOIN "FinanceBankMatch" m ON m.id=c."matchId" AND m."businessId"=c."businessId" WHERE c."businessId"=$1 AND m.state=\'ACTIVE\' GROUP BY c."sourceType",COALESCE(c."paymentId",c."paymentAdjustmentId",c."settlementId",c."transferId",c."cashMovementId"),c."sourceLeg"', [businessId]);
  return new Map(rows.map(row => [bankSourceKey(row), safeMoney(BigInt(row.amount))]));
}
