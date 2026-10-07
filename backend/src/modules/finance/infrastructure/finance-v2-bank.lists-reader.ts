import { FinanceInputError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import type { BankMatchComponentInput, FinanceBankMatchDto, FinanceBankRowDto, FinanceBankStatementDto, FinanceV2Page, FinanceV2PageQuery } from '../domain/finance-v2.types';
import { bankSourceKey } from '../application/finance-v2-bank-source';
import { evidenceUuid } from '../application/finance-v2-evidence.validation';
import { sqlInstant } from './finance-v2-bank-source.sql-reader';
import type { FinanceBankPublicSourceReader } from './finance-v2-bank.read-service';
import type { StoredStatement } from './finance-v2-import-bank.sql-store';
import type { FinanceSqlTransaction } from './finance-v2.repository';

interface StatementHeader extends Omit<FinanceBankStatementDto, 'rows' | 'loadedAt'> { loadedAt: Date | string; result: StoredStatement }
interface RowSql extends Omit<FinanceBankRowDto, 'amountMinor' | 'bookedOn' | 'reservedMinor' | 'residualMinor' | 'status'> { amountMinor: bigint | string; bookedOn: Date | string; reservedMinor: bigint | string }
interface MatchHeader extends Omit<FinanceBankMatchDto, 'rows' | 'components' | 'staleReasons' | 'createdAt' | 'cancelledAt'> { createdAt: Date | string; cancelledAt: Date | string | null }
interface ComponentSql {
  sourceType: BankMatchComponentInput['sourceType']; sourceId: string; sourceLeg: 'FROM' | 'TO' | null;
  sourceVersion: number; sourceHash: string; amountMinor: bigint | string;
}
// Caller owns authorization and RepeatableRead. Every detail read stays in the same transaction.
export async function loadBankStatements(tx: FinanceSqlTransaction, businessId: string, query: FinanceV2PageQuery): Promise<FinanceV2Page<FinanceBankStatementDto>> {
  requireQuery(query);
  const headers = await tx.query<StatementHeader>('SELECT id,"businessId","accountId","sourceNamespace","canonicalDigest","formatVersion","loadedAt","recordedByUserId",result FROM "FinanceBankStatement" WHERE "businessId"=$1 AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT $3', [businessId, query.cursor, query.limit + 1]);
  const selected = headers.slice(0, query.limit);
  const items: FinanceBankStatementDto[] = [];
  let count = selected.length;
  for (const header of selected) {
    const rowIds = header.result.rows.map(row => row.rowId);
    const rows = await tx.query<RowSql>('SELECT r.id,r."statementId",r."accountId",r."externalKey",r."bookedOn",r."amountMinor",r.reference,r.version,COALESCE((SELECT SUM(ABS(mr."consumedAmountMinor")) FROM "FinanceBankMatchRow" mr JOIN "FinanceBankMatch" m ON m.id=mr."matchId" AND m."businessId"=mr."businessId" WHERE mr."bankRowId"=r.id AND mr."businessId"=r."businessId" AND m.state=\'ACTIVE\'),0) AS "reservedMinor" FROM "FinanceBankRow" r WHERE r."businessId"=$1 AND r."accountId"=$2 AND r.id=ANY($3::text[]) ORDER BY r."bookedOn",r.id', [businessId, header.accountId, rowIds]);
    if (rows.length !== new Set(rowIds).size) throw new FinanceInputError('BANK_STATEMENT_EVIDENCE_INCOMPLETE');
    count += rows.length;
    if (count > 5000) throw new FinanceInputError('BANK_SOURCE_LIMIT_EXCEEDED');
    items.push({ id: header.id, businessId: header.businessId, accountId: header.accountId, sourceNamespace: header.sourceNamespace, canonicalDigest: header.canonicalDigest, formatVersion: header.formatVersion, loadedAt: sqlInstant(header.loadedAt), recordedByUserId: header.recordedByUserId, rows: rows.map(bankRowDto) });
  }
  return { items, nextCursor: headers.length > query.limit ? selected.at(-1)!.id : null };
}
export async function loadBankMatches(tx: FinanceSqlTransaction, businessId: string, query: FinanceV2PageQuery, publicSources: FinanceBankPublicSourceReader): Promise<FinanceV2Page<FinanceBankMatchDto>> {
  requireQuery(query);
  const headers = await tx.query<MatchHeader>('SELECT id,"businessId","accountId",version,state,reason,"recordedByUserId","createdAt","cancelledByUserId","cancelledAt","cancelReason" FROM "FinanceBankMatch" WHERE "businessId"=$1 AND ($2::text IS NULL OR id>$2) ORDER BY id LIMIT $3', [businessId, query.cursor, query.limit + 1]);
  const selected = headers.slice(0, query.limit);
  const sourceByAccount = new Map<string, Awaited<ReturnType<FinanceBankPublicSourceReader['load']>>>();
  const items: FinanceBankMatchDto[] = [];
  let count = selected.length;
  for (const header of selected) {
    const sources = sourceByAccount.get(header.accountId) ?? await publicSources.load(tx, businessId, header.accountId);
    sourceByAccount.set(header.accountId, sources);
    const rows = await tx.query<{ bankRowId: string; consumedAmountMinor: bigint | string }>('SELECT "bankRowId","consumedAmountMinor" FROM "FinanceBankMatchRow" WHERE "businessId"=$1 AND "matchId"=$2 ORDER BY "bankRowId"', [businessId, header.id]);
    const components = await tx.query<ComponentSql>('SELECT "sourceType",COALESCE("paymentId","paymentAdjustmentId","settlementId","transferId","cashMovementId") AS "sourceId","sourceLeg","sourceVersion","sourceHash","amountMinor" FROM "FinanceBankMatchComponent" WHERE "businessId"=$1 AND "matchId"=$2 ORDER BY "sourceType",COALESCE("paymentId","paymentAdjustmentId","settlementId","transferId","cashMovementId"),"sourceLeg"', [businessId, header.id]);
    count += rows.length + components.length;
    if (count > 5000) throw new FinanceInputError('BANK_SOURCE_LIMIT_EXCEEDED');
    const componentDtos = components.map(componentDto);
    const staleReasons = header.state === 'ACTIVE' ? staleComponentReasons(componentDtos, sources) : [];
    items.push({ ...header, createdAt: sqlInstant(header.createdAt), cancelledAt: header.cancelledAt ? sqlInstant(header.cancelledAt) : null, rows: rows.map(row => ({ bankRowId: row.bankRowId, consumedAmountMinor: safeMoney(BigInt(row.consumedAmountMinor)) })), components: componentDtos, staleReasons });
  }
  return { items, nextCursor: headers.length > query.limit ? selected.at(-1)!.id : null };
}
function requireQuery(query: FinanceV2PageQuery): void {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new FinanceInputError('BANK_PAGE_LIMIT_INVALID');
  if (query.cursor !== null) evidenceUuid(query.cursor, 'cursor');
}
function bankRowDto(row: RowSql): FinanceBankRowDto {
  const amountMinor = safeMoney(BigInt(row.amountMinor));
  const reservedMinor = safeMoney(BigInt(row.reservedMinor));
  if (reservedMinor < 0 || reservedMinor > Math.abs(amountMinor) || amountMinor === 0) throw new FinanceInputError('BANK_ROW_CAPACITY_INVALID');
  const residualMinor = safeMoney(BigInt(amountMinor) - BigInt(Math.sign(amountMinor)) * BigInt(reservedMinor));
  return { ...row, amountMinor, reservedMinor, residualMinor, bookedOn: sqlInstant(row.bookedOn).slice(0, 10), status: reservedMinor === 0 ? 'UNMATCHED' : residualMinor === 0 ? 'MATCHED' : 'PARTIAL' };
}
function componentDto(row: ComponentSql): BankMatchComponentInput {
  const fields = { sourceId: row.sourceId, sourceVersion: row.sourceVersion, sourceHash: row.sourceHash, amountMinor: safeMoney(BigInt(row.amountMinor)) };
  if (row.sourceType === 'TRANSFER') {
    if (row.sourceLeg !== 'FROM' && row.sourceLeg !== 'TO') throw new FinanceInputError('BANK_TRANSFER_LEG_INVALID');
    return { ...fields, sourceType: 'TRANSFER', sourceLeg: row.sourceLeg };
  }
  if (row.sourceLeg !== null) throw new FinanceInputError('BANK_SOURCE_LEG_INVALID');
  return { ...fields, sourceType: row.sourceType, sourceLeg: null };
}
function staleComponentReasons(components: BankMatchComponentInput[], sources: Awaited<ReturnType<FinanceBankPublicSourceReader['load']>>): string[] {
  const reasons: string[] = [];
  for (const component of components) {
    const key = bankSourceKey(component);
    const source = sources.find(item => bankSourceKey(item) === key);
    if (!source || !source.eligible) { reasons.push(`SOURCE_UNAVAILABLE:${key}`); continue; }
    if (source.sourceVersion !== component.sourceVersion || source.sourceHash !== component.sourceHash) reasons.push(`SOURCE_STALE:${key}`);
  }
  return reasons;
}
