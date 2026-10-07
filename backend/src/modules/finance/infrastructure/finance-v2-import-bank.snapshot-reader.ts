import { FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import { parseHistoryImportCsv } from '../application/finance-v2-import';
import { parseBankStatementCsv } from '../application/finance-v2-bank-statement';
import { FinanceCsvPreviewError } from '../application/finance-v2-csv-preview.error';
import { bankSourceKey } from '../application/finance-v2-bank-source';
import type { HistoryExpense, HistoryImportInput, ImportAccount, ImportExistingItem, ImportSnapshot, ScopedEvidenceRef } from '../application/finance-v2-import.types';
import type { BankMatchInput, BankMatchSnapshot, BankStatementInput, BankStatementSnapshot } from '../application/finance-v2-bank.types';
import type { FinanceImportBankSnapshotReader } from './finance-v2-import-bank.ports';
import type { FinanceBankPublicSourceReader } from './finance-v2-bank.read-service';
import { FinanceImportBankSqlStore } from './finance-v2-import-bank.sql-store';
import { sqlInstant } from './finance-v2-bank-source.sql-reader';
import type { BookingCostReferenceReader } from './finance-v2-expense.writer';
import type { FinanceSqlTransaction } from './finance-v2.repository';

interface AccountRow { id: string; businessId: string; kind: 'BANK' | 'CASH'; currency: 'PYG'; version: number; archived: boolean; openingId: string | null; occurredAt: Date | null; amountMinor: bigint | string | null }
interface CatalogRow extends ScopedEvidenceRef { kind: 'CATEGORY' | 'COUNTERPARTY' }
interface ResourceRow { id: string; businessId: string; updatedAt: Date; status: string }
type References = Pick<ImportSnapshot, 'catalogs' | 'resources' | 'bookings'>;
export class FinanceImportBankSqlSnapshotReader implements FinanceImportBankSnapshotReader {
  constructor(private readonly sources: FinanceBankPublicSourceReader, private readonly bookings: BookingCostReferenceReader, private readonly store = new FinanceImportBankSqlStore()) {}
  async history(tx: FinanceSqlTransaction, input: HistoryImportInput): Promise<ImportSnapshot> {
    const parsed = parseHistoryImportCsv(input.csv);
    if (parsed.errors.length) throw new FinanceCsvPreviewError(parsed.errors);
    const context = await readContext(tx, input.businessId);
    const expenseSources = parsed.sources.filter((source): source is HistoryExpense => source.kind === 'EXPENSE');
    const references = await this.references(tx, input.businessId, expenseSources);
    const accountIds = parsed.sources.flatMap(source => source.kind === 'EXPENSE' ? [] : [source.accountId]);
    const accounts = await readAccounts(tx, input.businessId, accountIds);
    const imported = await tx.query<ImportExistingItem & { openingId: string | null; expenseId: string | null; settlementId: string | null }>('SELECT "businessId","sourceNamespace","externalKey","payloadDigest",kind,"openingId","expenseId","settlementId" FROM "FinanceImportItem" WHERE "businessId"=$1 AND "sourceNamespace"=$2 AND "externalKey"=ANY($3::text[])', [input.businessId, input.sourceNamespace.trim(), parsed.sources.map(source => source.externalKey)]);
    const importedItems = imported.map(row => ({ ...row, sourceId: row.openingId ?? row.expenseId ?? row.settlementId ?? '' }));
    const expenseIds = [...parsed.sources.flatMap(source => source.kind === 'SETTLEMENT' && source.expenseId ? [source.expenseId] : []), ...importedItems.filter(item => item.kind === 'EXPENSE').map(item => item.sourceId)];
    const obligations = await tx.query<{ id: string; businessId: string; version: number; total: bigint | string; paid: bigint | string }>('SELECT e.id,e."businessId",e.version,e."amountMinor" AS total,COALESCE((SELECT SUM(s."amountMinor") FROM "FinanceSettlement" s WHERE s."expenseId"=e.id AND s."businessId"=e."businessId"),0) AS paid FROM "FinanceExpense" e WHERE e."businessId"=$1 AND e.id=ANY($2::text[])', [input.businessId, [...new Set(expenseIds)]]);
    const expenses = obligations.map(row => ({ id: row.id, businessId: row.businessId, version: row.version, outstandingMinor: outstanding(row.total, row.paid) }));
    return { businessId: input.businessId, ...context, ...references, accounts, expenses, importedItems };
  }
  async statement(tx: FinanceSqlTransaction, input: BankStatementInput): Promise<BankStatementSnapshot> {
    const parsed = parseBankStatementCsv(input.csv);
    if (parsed.errors.length) throw new FinanceCsvPreviewError(parsed.errors);
    const context = await readContext(tx, input.businessId);
    const account = (await readAccounts(tx, input.businessId, [input.accountId]))[0];
    if (!account) throw new FinanceNotFoundError('Cuenta no disponible.');
    const existingRows = await tx.query<BankStatementSnapshot['existingRows'][number]>('SELECT id,"businessId","accountId","sourceNamespace","externalKey","payloadDigest" FROM "FinanceBankRow" WHERE "businessId"=$1 AND "accountId"=$2 AND "sourceNamespace"=$3 AND "externalKey"=ANY($4::text[])', [input.businessId, input.accountId, input.sourceNamespace.trim(), parsed.rows.map(row => row.externalKey)]);
    return { businessId: input.businessId, timeZone: context.timeZone, account, existingRows };
  }
  async match(tx: FinanceSqlTransaction, input: BankMatchInput): Promise<BankMatchSnapshot> {
    const context = await readContext(tx, input.businessId);
    const account = (await readAccounts(tx, input.businessId, [input.accountId]))[0];
    if (!account) throw new FinanceNotFoundError('Cuenta no disponible.');
    const reserved = await this.store.reservations(tx, input);
    const bankRows = await tx.query<{ id: string; businessId: string; accountId: string; version: number; amountMinor: bigint | string; bookedOn: Date | string; reference: string | null }>('SELECT id,"businessId","accountId",version,"amountMinor","bookedOn",reference FROM "FinanceBankRow" WHERE "businessId"=$1 AND "accountId"=$2 AND id=ANY($3::text[])', [input.businessId, input.accountId, input.rows.map(row => row.id)]);
    const rows = bankRows.map(row => ({ ...row, amountMinor: safeMoney(BigInt(row.amountMinor)), bookedOn: sqlInstant(row.bookedOn).slice(0, 10), reservedMinor: reserved.rows.get(row.id) ?? 0 }));
    const requestedKeys = new Set(input.components.map(bankSourceKey));
    const sourceRows = await this.sources.load(tx, input.businessId, input.accountId);
    const sources = sourceRows.filter(source => requestedKeys.has(bankSourceKey(source))).map(source => ({ ...source, reservedMinor: reserved.sources.get(bankSourceKey(source)) ?? 0 }));
    const feeOrigins = await readFeeOrigins(tx, input.businessId, input.rows.map(row => row.id));
    const existingFees = await readExistingFees(tx, input.businessId, input.fees.flatMap(fee => 'existingSettlementId' in fee ? [fee.existingSettlementId] : []));
    const newDefinitions = input.fees.flatMap(fee => 'expenseDefinition' in fee ? [{ ...fee.expenseDefinition, kind: 'EXPENSE' as const, externalKey: fee.bankRowId, rowKeys: [], consumedOn: fee.consumedOn, dueOn: null, lines: fee.expenseDefinition.lines.map((line, index) => ({ ...line, ordinal: index + 1, rowKey: `${fee.bankRowId}:${index}` })) }] : []);
    const references = await this.references(tx, input.businessId, newDefinitions);
    const feeReferences = [
      ...references.catalogs,
      ...references.resources.map(ref => ({ ...ref, kind: 'RESOURCE' as const })),
      ...references.bookings.map(ref => ({ ...ref, kind: 'BOOKING' as const })),
    ];
    return { businessId: input.businessId, ...context, account, rows, sources, feeOrigins, existingFees, feeReferences };
  }
  private async references(tx: FinanceSqlTransaction, businessId: string, expenses: readonly HistoryExpense[]): Promise<References> {
    const lines = expenses.flatMap(expense => expense.lines);
    const catalogIds = [...new Set([...lines.map(line => line.categoryId), ...expenses.flatMap(expense => expense.counterpartyId ? [expense.counterpartyId] : [])])];
    const catalogs = await tx.query<CatalogRow>('SELECT id,"businessId",kind,version,archived FROM "FinanceCatalog" WHERE "businessId"=$1 AND id=ANY($2::text[])', [businessId, catalogIds]);
    const resourceIds = [...new Set(lines.flatMap(line => line.resourceId ? [line.resourceId] : []))];
    const resourceRows = await tx.query<ResourceRow>('SELECT id,"businessId","updatedAt",status FROM "Resource" WHERE "businessId"=$1 AND id=ANY($2::text[])', [businessId, resourceIds]);
    const resources = resourceRows.map(row => ({ id: row.id, businessId: row.businessId, version: new Date(row.updatedAt).getTime(), archived: row.status !== 'ACTIVE' }));
    const bookingRefs: ImportSnapshot['bookings'][number][] = [];
    for (const bookingId of [...new Set(lines.flatMap(line => line.bookingId ? [line.bookingId] : []))]) {
      const booking = await this.bookings.read(tx, businessId, bookingId);
      if (booking) bookingRefs.push({ id: booking.id, businessId, resourceId: booking.resourceId, version: new Date(booking.updatedAt).getTime(), archived: false });
    }
    return { catalogs, resources, bookings: bookingRefs };
  }
}
async function readContext(tx: FinanceSqlTransaction, businessId: string): Promise<Pick<ImportSnapshot, 'timeZone' | 'now' | 'policy'>> {
  const businesses = await tx.query<{ timezone: string; currency: string; now: Date }>('SELECT timezone,currency,CURRENT_TIMESTAMP AS now FROM "Business" WHERE id=$1', [businessId]);
  if (!businesses[0]) throw new FinanceNotFoundError('Negocio no disponible.');
  if (businesses[0].currency !== 'PYG') throw new FinanceInputError('CURRENCY_INVALID');
  const policies = await tx.query<{ enabled: boolean; version: number }>('SELECT enabled,version FROM "FinanceApprovalPolicyRevision" WHERE "businessId"=$1 ORDER BY version DESC LIMIT 1', [businessId]);
  return { timeZone: businesses[0].timezone, now: sqlInstant(businesses[0].now), policy: policies[0] ?? { enabled: false, version: 0 } };
}
async function readAccounts(tx: FinanceSqlTransaction, businessId: string, ids: readonly string[]): Promise<ImportAccount[]> {
  const rows = await tx.query<AccountRow>('SELECT a.id,a."businessId",a.kind,b.currency,a.version,a.archived,o.id AS "openingId",o."occurredAt",o."amountMinor" FROM "FinanceAccount" a JOIN "Business" b ON b.id=a."businessId" LEFT JOIN "FinanceOpening" o ON o."accountId"=a.id AND o."businessId"=a."businessId" WHERE a."businessId"=$1 AND a.id=ANY($2::text[]) ORDER BY a.id', [businessId, [...new Set(ids)]]);
  return rows.map(row => ({ id: row.id, businessId: row.businessId, kind: row.kind, currency: row.currency, version: row.version, archived: row.archived, opening: row.openingId ? { id: row.openingId, occurredAt: sqlInstant(row.occurredAt!), amountMinor: safeMoney(BigInt(row.amountMinor!)) } : null }));
}
async function readFeeOrigins(tx: FinanceSqlTransaction, businessId: string, bankRowIds: readonly string[]): Promise<BankMatchSnapshot['feeOrigins']> {
  const rows = await tx.query<{ businessId: string; bankRowId: string; expenseId: string; settlementId: string; amountMinor: bigint | string }>('SELECT f."businessId",f."bankRowId",f."expenseId",f."settlementId",s."amountMinor" FROM "FinanceBankFeeOrigin" f JOIN "FinanceSettlement" s ON s.id=f."settlementId" AND s."businessId"=f."businessId" WHERE f."businessId"=$1 AND f."bankRowId"=ANY($2::text[])', [businessId, bankRowIds]);
  return rows.map(row => ({ ...row, amountMinor: safeMoney(BigInt(row.amountMinor)) }));
}
async function readExistingFees(tx: FinanceSqlTransaction, businessId: string, settlementIds: readonly string[]): Promise<BankMatchSnapshot['existingFees']> {
  const rows = await tx.query<{ businessId: string; expenseId: string; settlementId: string; accountId: string; expenseAmountMinor: bigint | string; settlementAmountMinor: bigint | string }>('SELECT s."businessId",s."expenseId",s.id AS "settlementId",s."accountId",e."amountMinor" AS "expenseAmountMinor",s."amountMinor" AS "settlementAmountMinor" FROM "FinanceSettlement" s JOIN "FinanceExpense" e ON e.id=s."expenseId" AND e."businessId"=s."businessId" WHERE s."businessId"=$1 AND s.id=ANY($2::text[])', [businessId, settlementIds]);
  return rows.map(row => ({ ...row, expenseAmountMinor: safeMoney(BigInt(row.expenseAmountMinor)), settlementAmountMinor: safeMoney(BigInt(row.settlementAmountMinor)), eligible: true }));
}
function outstanding(total: bigint | string, paid: bigint | string): number {
  const amount = BigInt(total) - BigInt(paid);
  if (amount < 0n) throw new FinanceInputError('EXPENSE_OBLIGATION_INVALID');
  return safeMoney(amount);
}
