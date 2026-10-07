import type { FinanceSqlTransaction } from './finance-v2.repository';
import { FinanceBankSqlSourceReader, type FinancePublicPaymentMoneyReader, type FinancePublicPaymentMoneySource } from './finance-v2-bank-source.sql-reader';
import { FinanceBankReadService, type FinanceBankPublicSourceReader, type FinanceBankReadHost } from './finance-v2-bank.read-service';
import { loadBankMatches, loadBankStatements } from './finance-v2-bank.lists-reader';
import type { BankSourceSnapshot } from '../application/finance-v2-bank.types';

const BIZ = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';
const PAYMENT = '00000000-0000-0000-0000-000000000003';
const REFUND = '00000000-0000-0000-0000-000000000004';
const ROW = '00000000-0000-0000-0000-000000000005';
class ReadSql implements FinanceSqlTransaction {
  readonly calls: { sql: string; parameters: readonly unknown[] }[] = [];
  constructor(private readonly replies: object[][]) {}
  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> { this.calls.push({ sql, parameters }); return Promise.resolve((this.replies.shift() ?? []) as T[]); }
  execute(): Promise<number> { return Promise.reject(new Error('Read service must not write')); }
}
function money(sourceType: 'PAYMENT' | 'REFUND', amount: number): FinancePublicPaymentMoneySource {
  return { sourceType, sourceId: sourceType === 'PAYMENT' ? PAYMENT : REFUND, paymentId: PAYMENT, bookingId: ROW, paymentVersion: 3, version: sourceType === 'PAYMENT' ? 3 : 2, amountMinorSigned: amount, currency: 'PYG', occurredAt: '2026-10-02T01:00:00Z', accountId: sourceType === 'PAYMENT' ? null : ACCOUNT, reference: null };
}
function source(overrides: Partial<BankSourceSnapshot> = {}): BankSourceSnapshot & { description: string } {
  return { businessId: BIZ, accountId: ACCOUNT, currency: 'PYG', sourceType: 'PAYMENT', sourceId: PAYMENT, sourceLeg: null, sourceVersion: 3, sourceHash: 'a'.repeat(64), amountMinor: 1000000, occurredAt: '2026-10-02T01:00:00.000Z', bookedOn: '2026-10-01', reference: null, reservedMinor: 0, eligible: true, linkVersion: 2, description: 'Cobro bruto', ...overrides };
}
describe('FIN-020 concrete read adapters', () => {
  it('uses the same public Payment transaction and signs Finance sources without reading Payment tables', async () => {
    const moneySources = jest.fn().mockResolvedValue([money('PAYMENT', 1000000), money('REFUND', -100000)]);
    const payments: FinancePublicPaymentMoneyReader = { moneySources };
    const tx = new ReadSql([
      [{ timezone: 'America/Asuncion' }], [{ paymentId: PAYMENT, accountId: ACCOUNT, version: 2 }],
      [{ id: ROW, accountId: ACCOUNT, amountMinor: 150000n, occurredAt: new Date('2026-10-02T01:00:00Z'), reference: null, description: 'Comisión' }],
      [{ id: 'withdrawal', accountId: ACCOUNT, amountMinor: -200000n, occurredAt: new Date('2026-10-02T01:00:00Z'), reference: null, description: 'Retiro', kind: 'WITHDRAWAL' }],
      [{ id: 'transfer', fromAccountId: ACCOUNT, toAccountId: ROW, amountMinor: 50000n, occurredAt: new Date('2026-10-02T01:00:00Z'), reason: 'Transferencia propia' }],
    ]);
    const rows = await new FinanceBankSqlSourceReader(payments).load(tx, BIZ, ACCOUNT);
    expect(moneySources).toHaveBeenCalledWith(tx, BIZ);
    expect(rows.map(row => row.amountMinor)).toEqual([1000000, -100000, -150000, -200000, -50000]);
    expect(rows[0]).toMatchObject({ sourceVersion: 3, linkVersion: 2, bookedOn: '2026-10-01', accountId: ACCOUNT });
    expect(rows[1]).toMatchObject({ sourceType: 'REFUND', sourceId: REFUND, sourceVersion: 2, accountId: ACCOUNT });
    expect(rows[4]).toMatchObject({ sourceType: 'TRANSFER', sourceLeg: 'FROM' });
    expect(rows.every(row => /^[0-9a-f]{64}$/.test(row.sourceHash))).toBe(true);
    expect(tx.calls.some(call => /FROM "Payment(?:Adjustment)?"/.test(call.sql))).toBe(false);
  });
  it('keeps refund account fixed when the original Payment link belongs to another account', async () => {
    const tx = new ReadSql([[{ timezone: 'UTC' }], [{ paymentId: PAYMENT, accountId: ROW, version: 4 }], [], [], []]);
    const payments: FinancePublicPaymentMoneyReader = { moneySources: jest.fn().mockResolvedValue([money('PAYMENT', 1000000), money('REFUND', -100000)]) };
    expect((await new FinanceBankSqlSourceReader(payments).load(tx, BIZ, ACCOUNT)).map(row => row.sourceType)).toEqual(['REFUND']);
  });
  it('available source DTO preserves the economic hash and subtracts ACTIVE reservations, including stale ones', async () => {
    const tx = new ReadSql([[{ status: 'ACTIVE', role: 'OWNER' }], [{ id: ACCOUNT, kind: 'BANK', currency: 'PYG' }], [{ sourceType: 'PAYMENT', sourceId: PAYMENT, sourceLeg: null, amount: '900000' }, { sourceType: 'REFUND', sourceId: REFUND, sourceLeg: null, amount: '20000' }]]);
    const current = [source(), source({ sourceType: 'REFUND', sourceId: REFUND, sourceVersion: 2, amountMinor: -100000 })];
    const publicReader: FinanceBankPublicSourceReader = { load: jest.fn().mockResolvedValue(current) };
    const host: FinanceBankReadHost = { read: work => work(tx) };
    const before = JSON.stringify(current);
    const rows = await new FinanceBankReadService(host, publicReader).availableSources({ businessId: BIZ, actorUserId: ROW, accountId: ACCOUNT });
    expect(rows.find(row => row.ref.sourceType === 'PAYMENT')).toMatchObject({ amountMinor: 1000000, residualMinor: 100000, sourceHash: 'a'.repeat(64) });
    expect(rows.find(row => row.ref.sourceType === 'REFUND')).toMatchObject({ amountMinor: -100000, residualMinor: -80000 });
    expect(JSON.stringify(current)).toBe(before);
    expect(tx.calls[2].sql).toContain("m.state='ACTIVE'");
    expect(tx.calls[1].sql).toContain('JOIN "Business" b ON b.id=a."businessId"');
    expect(tx.calls[1].sql).toContain('b.currency');
    expect(tx.calls[1].sql).not.toContain('a.currency');
  });
  it.each(['ADMIN', 'RECEPTIONIST', 'VIEWER'])('denies %s before fetching monetary sources', async role => {
    const tx = new ReadSql([[{ status: 'ACTIVE', role }]]); const load = jest.fn(); const publicReader: FinanceBankPublicSourceReader = { load };
    await expect(new FinanceBankReadService({ read: work => work(tx) }, publicReader).availableSources({ businessId: BIZ, actorUserId: ROW, accountId: ACCOUNT })).rejects.toThrow('no autorizado');
    expect(load).not.toHaveBeenCalled(); expect(tx.calls).toHaveLength(1);
  });
  it('permits unlinked gross Payment evidence and hides other accounts/ineligible sources', async () => {
    const tx = new ReadSql([[{ status: 'ACTIVE', role: 'OWNER' }], [{ id: ACCOUNT, kind: 'BANK', currency: 'PYG' }], []]);
    const publicReader: FinanceBankPublicSourceReader = { load: jest.fn().mockResolvedValue([source({ accountId: null }), source({ sourceId: REFUND, accountId: ROW }), source({ sourceId: ROW, eligible: false })]) };
    const rows = await new FinanceBankReadService({ read: work => work(tx) }, publicReader).availableSources({ businessId: BIZ, actorUserId: ROW, accountId: ACCOUNT });
    expect(rows).toHaveLength(1); expect(rows[0]).toMatchObject({ accountId: null, needsAccountLink: true, residualMinor: 1000000 });
  });
  it('returns reused statement row IDs with original provenance and current residuals', async () => {
    const tx = new ReadSql([
      [{ id: PAYMENT, businessId: BIZ, accountId: ACCOUNT, sourceNamespace: 'own-bank', canonicalDigest: 'a'.repeat(64), formatVersion: 'FINANCE_BANK_V1', loadedAt: new Date('2026-10-05Z'), recordedByUserId: ROW, result: { commandResult: {}, rows: [{ rowId: ROW, externalKey: 'a', status: 'ALREADY_IMPORTED' }], totalMinor: 850000 } }],
      [{ id: ROW, statementId: REFUND, accountId: ACCOUNT, externalKey: 'a', bookedOn: new Date('2026-10-02Z'), amountMinor: 850000n, reference: null, version: 1, reservedMinor: 850000n }],
    ]);
    const result = await loadBankStatements(tx, BIZ, { cursor: null, limit: 20 });
    expect(result.items[0].rows[0]).toMatchObject({ id: ROW, statementId: REFUND, status: 'MATCHED', residualMinor: 0 });
    expect(result.items[0]).not.toHaveProperty('result'); expect(tx.calls.every(call => call.parameters[0] === BIZ)).toBe(true);
  });
  it('reports ACTIVE groups as stale when a Payment source changed, while preserving stored economics', async () => {
    const tx = new ReadSql([
      [{ id: ROW, businessId: BIZ, accountId: ACCOUNT, version: 1, state: 'ACTIVE', reason: 'Evidencia', recordedByUserId: PAYMENT, createdAt: new Date('2026-10-02Z'), cancelledByUserId: null, cancelledAt: null, cancelReason: null }],
      [{ bankRowId: ROW, consumedAmountMinor: 1000000n }],
      [{ sourceType: 'PAYMENT', sourceId: PAYMENT, sourceLeg: null, sourceVersion: 2, sourceHash: 'b'.repeat(64), amountMinor: 1000000n }],
    ]);
    const publicReader: FinanceBankPublicSourceReader = { load: jest.fn().mockResolvedValue([source()]) };
    const result = await loadBankMatches(tx, BIZ, { cursor: null, limit: 20 }, publicReader);
    expect(result.items[0].components[0].amountMinor).toBe(1000000); expect(result.items[0].staleReasons[0]).toContain('SOURCE_STALE:PAYMENT:');
  });
});
