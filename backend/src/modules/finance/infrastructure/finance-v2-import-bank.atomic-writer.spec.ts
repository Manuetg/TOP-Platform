import { FinanceImportBankSqlAtomicWriter } from './finance-v2-import-bank.atomic-writer';
import { FinanceImportBankSqlSnapshotReader } from './finance-v2-import-bank.snapshot-reader';
import type { FinanceBankPublicSourceReader } from './finance-v2-bank.read-service';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import type { BankFeePlan } from '../application/finance-v2-bank.types';

const BIZ = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';
const CATEGORY = '00000000-0000-0000-0000-000000000003';
const ACTOR = '00000000-0000-0000-0000-000000000004';
const occurredAt = '2026-10-01T12:00:00.000Z';
const input: FinanceV2Mutation = { businessId: BIZ, actorUserId: ACTOR, command: { type: 'CONFIRM_BANK_MATCH', accountId: ACCOUNT, rows: [], components: [], paymentLinks: [], fees: [], previewToken: 'a'.repeat(64), reason: 'Bank fee' }, idempotencyKey: 'bank-fee-test-0001', fingerprint: 'b'.repeat(64) };
const plan: BankFeePlan = { bankRowId: CATEGORY, mode: 'CREATE', amountMinor: -150000, expenseId: null, settlementId: null, input: { bankRowId: CATEGORY, expenseDefinition: { description: 'Comisión bancaria', amountMinor: 150000, counterpartyId: null, reference: 'Bank proof', lines: [{ label: 'Comisión', categoryId: CATEGORY, resourceId: null, bookingId: null, amountMinor: 150000, operational: true }] }, consumedOn: '2026-10-01', occurredAt, reference: 'Bank proof' } };

function fixture() {
  const writes: { sql: string; parameters: readonly unknown[] }[] = [];
  const reads: { sql: string; parameters: readonly unknown[] }[] = [];
  let expenseId = '';
  let settlementId = '';
  const tx: FinanceSqlTransaction = {
    query: <T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> => {
      reads.push({ sql, parameters });
      let rows: object[] = [];
      if (sql.includes('FROM "FinanceCatalog"')) rows = [{ id: CATEGORY }];
      else if (sql.includes('SELECT "amountMinor",version FROM "FinanceExpense"')) rows = [{ amountMinor: 150000n, version: 1 }];
      else if (sql.includes('SUM("amountMinor")')) rows = [{ paid: '0' }];
      else if (sql.includes('FROM "FinanceAccount"')) rows = [{ archived: false, currency: 'PYG', version: 1, openingId: null, occurredAt: new Date('2026-09-01Z') }];
      else if (sql.includes('FROM "Business"')) rows = [{ currency: 'PYG', timezone: 'UTC', now: new Date('2026-10-05Z') }];
      return Promise.resolve(rows as T[]);
    },
    execute: (sql, parameters) => {
      writes.push({ sql, parameters });
      if (sql.includes('INSERT INTO "FinanceExpense" ')) expenseId = parameters[0] as string;
      if (sql.includes('INSERT INTO "FinanceSettlement"')) settlementId = parameters[0] as string;
      return Promise.resolve(1);
    },
  };
  const sources: FinanceBankPublicSourceReader = { load: () => Promise.resolve(settlementId ? [{ businessId: BIZ, accountId: ACCOUNT, currency: 'PYG', sourceType: 'SETTLEMENT', sourceId: settlementId, sourceLeg: null, sourceVersion: 1, sourceHash: 'c'.repeat(64), amountMinor: -150000, occurredAt, bookedOn: '2026-10-01', reference: 'Bank proof', reservedMinor: 0, eligible: true, linkVersion: null, description: 'Comisión' }] : []) };
  const writer = new FinanceImportBankSqlAtomicWriter({ read: () => Promise.resolve(null) }, sources);
  return { tx, writer, sources, reads, writes, getExpenseId: () => expenseId };
}

describe('concrete bank import atomic writer', () => {
  it('creates a positive expense/settlement and returns the negative bank component exactly once', async () => {
    const f = fixture();
    const result = await f.writer.bankFee(f.tx, input, plan, ACCOUNT);
    const expense = f.writes.filter(call => call.sql.includes('INSERT INTO "FinanceExpense" '));
    const settlements = f.writes.filter(call => call.sql.includes('INSERT INTO "FinanceSettlement"'));
    expect(expense).toHaveLength(1); expect(settlements).toHaveLength(1);
    expect(expense[0].parameters[7]).toBe(150000n);
    expect(settlements[0].parameters[4]).toBe(150000n);
    expect(settlements[0].parameters[2]).toBe(f.getExpenseId());
    expect(result).toMatchObject({ expenseId: f.getExpenseId(), settlement: { sourceType: 'SETTLEMENT', amountMinor: -150000, accountId: ACCOUNT } });
  });

  it('rejects a bank fee with an incoherent signed plan before persisting any fact', async () => {
    const f = fixture();
    await expect(f.writer.bankFee(f.tx, input, { ...plan, amountMinor: 150000 }, ACCOUNT)).rejects.toThrow('signo');
    expect(f.writes).toHaveLength(0);
  });

  it('reads opening currency from the tenant Business and then advances Account CAS', async () => {
    const f = fixture();
    await f.writer.opening(f.tx, input, { kind: 'OPENING', externalKey: 'opening', rowKeys: ['opening'], accountId: ACCOUNT, amountMinor: 100000, occurredAt, reason: 'Initial cut' });
    expect(f.reads[0].sql).toContain('JOIN "Business" b ON b.id=a."businessId"');
    expect(f.reads[0].sql).toContain('b.currency');
    expect(f.reads[0].parameters).toEqual([BIZ, ACCOUNT]);
    expect(f.writes.at(-1)?.parameters).toEqual([BIZ, ACCOUNT, 1]);
  });

  it('uses tenant Business currency for a bank statement snapshot without adding an Account column', async () => {
    const f = fixture();
    const sqlAccount = { id: ACCOUNT, businessId: BIZ, kind: 'BANK', archived: false, currency: 'PYG', version: 1, openingId: null, occurredAt: null, amountMinor: null };
    const tx: FinanceSqlTransaction = { ...f.tx, query: async <T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> => {
      if (sql.includes('FROM "FinanceAccount"')) {
        expect(sql).toContain('JOIN "Business" b ON b.id=a."businessId"');
        expect(sql).toContain('b.currency');
        expect(parameters).toEqual([BIZ, [ACCOUNT]]);
        return [sqlAccount] as unknown as T[];
      }
      return f.tx.query<T>(sql, parameters);
    } };
    const snapshot = await new FinanceImportBankSqlSnapshotReader(f.sources, { read: () => Promise.resolve(null) }).statement(tx, { businessId: BIZ, accountId: ACCOUNT, expectedAccountVersion: 1, sourceNamespace: 'own-bank', csv: 'externalKey,bookedOn,amountMinor,reference\nfee,2026-10-01,-150000,Bank proof' });
    expect(snapshot.account).toMatchObject({ id: ACCOUNT, businessId: BIZ, currency: 'PYG' });
  });
});
