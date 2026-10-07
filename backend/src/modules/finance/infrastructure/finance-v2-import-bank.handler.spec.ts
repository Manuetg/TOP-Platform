import { HISTORY_CSV_HEADER, previewHistoryImport } from '../application/finance-v2-import';
import { previewBankMatch, previewBankStatement } from '../application/finance-v2-bank-match';
import type { ImportSnapshot } from '../application/finance-v2-import.types';
import type { BankMatchSnapshot, BankSourceSnapshot, BankStatementSnapshot } from '../application/finance-v2-bank.types';
import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceImportBankAtomicWriter, FinanceImportBankSnapshotReader } from './finance-v2-import-bank.ports';
import { FinanceImportBankCommandHandler } from './finance-v2-import-bank.handler';

const BUSINESS = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';
const CATEGORY = '00000000-0000-0000-0000-000000000003';
const ROW = '00000000-0000-0000-0000-000000000004';
const PAYMENT = '00000000-0000-0000-0000-000000000005';
const SETTLEMENT = '00000000-0000-0000-0000-000000000006';
const EXPENSE = '00000000-0000-0000-0000-000000000007';
const BOOKING = '00000000-0000-0000-0000-000000000008';
type AtomicWriterMocks = { [K in keyof FinanceImportBankAtomicWriter]: jest.MockedFunction<(...args: Parameters<NonNullable<FinanceImportBankAtomicWriter[K]>>) => ReturnType<NonNullable<FinanceImportBankAtomicWriter[K]>>> };
class TestSql implements FinanceSqlTransaction {
  readonly queries: { sql: string; parameters: readonly unknown[] }[] = [];
  readonly writes: { sql: string; parameters: readonly unknown[] }[] = [];
  prior: unknown[] = [];
  cancelled: { version: number; state: string } | null = null;
  reserved = 0;
  affected = 1;
  failInsert = false;
  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> {
    this.queries.push({ sql, parameters });
    if (sql.includes('FinanceBankMatchComponent')) return Promise.resolve([{ amount: String(this.reserved) }] as unknown as T[]);
    if (sql.includes('SELECT version,state')) return Promise.resolve((this.cancelled ? [this.cancelled] : []) as unknown as T[]);
    if (sql.includes('SELECT result')) return Promise.resolve(this.prior as T[]);
    return Promise.resolve([]);
  }
  execute(sql: string, parameters: readonly unknown[]): Promise<number> {
    this.writes.push({ sql, parameters });
    if (this.failInsert && sql.includes('INSERT INTO "FinanceBankMatch"')) return Promise.reject(new Error('injected write failure'));
    return Promise.resolve(this.affected);
  }
}
function bank(): BankMatchSnapshot {
  return { businessId: BUSINESS, timeZone: 'America/Asuncion', now: '2026-10-05T00:00:00.000Z', policy: { enabled: false, version: 0 },
    account: { id: ACCOUNT, businessId: BUSINESS, kind: 'BANK', currency: 'PYG', archived: false, version: 1, opening: { id: 'opening', amountMinor: 0, occurredAt: '2026-10-01T00:00:00.000Z' } },
    rows: [{ id: ROW, businessId: BUSINESS, accountId: ACCOUNT, amountMinor: 1000000, version: 1, bookedOn: '2026-10-02', reference: null, reservedMinor: 0 }],
    sources: [{ sourceId: PAYMENT, sourceType: 'PAYMENT', sourceLeg: null, amountMinor: 1000000, sourceVersion: 1, sourceHash: 'a'.repeat(64), businessId: BUSINESS, currency: 'PYG', accountId: ACCOUNT, reservedMinor: 0, eligible: true, linkVersion: 1, occurredAt: '2026-10-02T00:00:00.000Z', bookedOn: '2026-10-02', reference: null }],
    feeOrigins: [], existingFees: [], feeReferences: [{ id: CATEGORY, businessId: BUSINESS, kind: 'CATEGORY', archived: false, version: 1 }],
  };
}
function history(): ImportSnapshot { const current = bank(); return { businessId: BUSINESS, timeZone: current.timeZone, now: current.now, policy: current.policy, accounts: [{ ...current.account, opening: null }], catalogs: [{ id: CATEGORY, businessId: BUSINESS, kind: 'CATEGORY', archived: false, version: 1 }], resources: [], bookings: [{ id: BOOKING, businessId: BUSINESS, resourceId: null, archived: false, version: 1 }], expenses: [], importedItems: [] }; }
function csvRow(fields: Record<string, string>): string { return HISTORY_CSV_HEADER.map(key => fields[key] ?? '').join(','); }
function historyCsv(bookingId = ''): string {
  return [HISTORY_CSV_HEADER.join(','),
    csvRow({ rowKind: 'SETTLEMENT', rowKey: 's', accountId: ACCOUNT, expenseDocumentKey: 'e', amountMinor: '300000', occurredAt: '2026-09-01T00:00:00Z', includedInOpening: 'true' }),
    csvRow({ rowKind: 'EXPENSE_LINE', rowKey: 'l', documentKey: 'e', description: 'Servicio', consumedOn: '2026-09-01', documentAmountMinor: '900000', lineOrdinal: '1', label: 'Servicio', categoryId: CATEGORY, lineAmountMinor: '900000', operational: 'true', bookingId }),
    csvRow({ rowKind: 'OPENING', rowKey: 'o', accountId: ACCOUNT, amountMinor: '1000000', occurredAt: '2026-10-01T00:00:00Z', reason: 'Corte explícito' }),
  ].join('\n');
}
function mutation(command: FinanceV2Mutation['command']): FinanceV2Mutation { return { businessId: BUSINESS, actorUserId: BOOKING, command, idempotencyKey: 'intent-1', fingerprint: 'fingerprint-1' }; }
function harness(currentBank = bank(), currentHistory = history()): { tx: TestSql; reader: FinanceImportBankSnapshotReader; writer: AtomicWriterMocks; handler: FinanceImportBankCommandHandler; events: string[] } {
  const events: string[] = []; const tx = new TestSql();
  const statement: BankStatementSnapshot = { businessId: BUSINESS, timeZone: currentBank.timeZone, account: currentBank.account, existingRows: [] };
  const reader: FinanceImportBankSnapshotReader = { history: jest.fn().mockResolvedValue(currentHistory), statement: jest.fn().mockResolvedValue(statement), match: jest.fn().mockResolvedValue(currentBank) };
  const writer: AtomicWriterMocks = {
    opening: jest.fn().mockImplementation(() => { events.push('OPENING'); return Promise.resolve({ id: ACCOUNT }); }),
    expense: jest.fn().mockImplementation(() => { events.push('EXPENSE'); return Promise.resolve({ id: EXPENSE }); }),
    settlement: jest.fn().mockImplementation(() => { events.push('SETTLEMENT'); return Promise.resolve({ id: SETTLEMENT }); }),
    paymentLink: jest.fn().mockResolvedValue({ ...currentBank.sources[0], accountId: ACCOUNT, sourceVersion: 2, sourceHash: 'b'.repeat(64) }),
    bankFee: jest.fn().mockResolvedValue({ expenseId: EXPENSE, settlement: { ...currentBank.sources[0], sourceId: SETTLEMENT, sourceType: 'SETTLEMENT', amountMinor: -150000, sourceHash: 'c'.repeat(64) } as BankSourceSnapshot }),
  };
  return { tx, reader, writer, handler: new FinanceImportBankCommandHandler(reader, writer), events };
}
function bankMutation(current: BankMatchSnapshot): FinanceV2Mutation {
  const params = { businessId: BUSINESS, accountId: ACCOUNT, rows: current.rows.map(row => ({ id: row.id, version: row.version, amountMinor: row.amountMinor })), components: current.sources.map(source => ({ sourceType: 'PAYMENT' as const, sourceId: source.sourceId, sourceLeg: null, sourceVersion: source.sourceVersion, sourceHash: source.sourceHash, amountMinor: source.amountMinor })), paymentLinks: [] as { paymentId: string; expectedLinkVersion: number; accountId: string; reason: string }[], fees: [] };
  const preview = previewBankMatch(params, current);
  return mutation({ ...params, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken!, reason: 'Relacionar evidencia explícita' });
}
describe('FIN-016/020 typed SQL handler', () => {
  it('orders history sources before settlements and persists FK XOR items without raw CSV', async () => {
    const h = harness(); const csv = historyCsv(); const params = { businessId: BUSINESS, sourceNamespace: 'own-history', csv };
    const preview = previewHistoryImport(params, history());
    const request = mutation({ type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: params.sourceNamespace, csv, previewToken: preview.previewToken!, reason: 'Historia propia' });
    const result = await h.handler.execute(h.tx, request, new Set());
    expect(h.events).toEqual(['OPENING', 'EXPENSE', 'SETTLEMENT']);
    expect(h.writer.settlement).toHaveBeenCalledWith(h.tx, request, expect.objectContaining({ includedInOpening: true }), EXPENSE);
    const items = h.tx.writes.filter(write => write.sql.includes('FinanceImportItem'));
    expect(items).toHaveLength(3);
    expect(items.every(write => write.parameters.slice(7, 10).filter(value => value !== null).length === 1)).toBe(true);
    expect(JSON.stringify(h.tx.writes)).not.toContain('rowKind,rowKey');
    expect(result.relatedIds?.importBatchId).toBe(result.id);
  });
  it('requires declared Booking refs to have been locked before writing an imported line', async () => {
    const h = harness(); const csv = historyCsv(BOOKING); const params = { businessId: BUSINESS, sourceNamespace: 'own-history', csv };
    const preview = previewHistoryImport(params, history());
    const request = mutation({ type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: params.sourceNamespace, csv, previewToken: preview.previewToken!, reason: 'Historia propia' });
    expect(await h.handler.bookingReferences(h.tx, request)).toEqual([BOOKING]);
    await expect(h.handler.execute(h.tx, request, new Set())).rejects.toThrow('BOOKING_LOCK_REQUIRED');
    expect(h.tx.writes).toHaveLength(0);
    await expect(h.handler.execute(h.tx, request, new Set([BOOKING]))).resolves.toMatchObject({ type: 'CONFIRM_HISTORY_IMPORT' });
  });
  it('returns original batch result for an exact canonical digest and adds no source/item writes', async () => {
    const h = harness(); const csv = historyCsv(); const preview = previewHistoryImport({ businessId: BUSINESS, sourceNamespace: 'own', csv }, history());
    const original = { id: ACCOUNT, version: 1, type: 'CONFIRM_HISTORY_IMPORT' as const, relatedIds: { importBatchId: ACCOUNT } };
    h.tx.prior = [{ result: { commandResult: original, items: [], cash: preview.cash } }];
    const result = await h.handler.execute(h.tx, mutation({ type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: 'own', csv, previewToken: preview.previewToken!, reason: 'Carga' }), new Set());
    expect(result).toEqual(original); expect(h.events).toEqual([]); expect(h.tx.writes).toEqual([]);
  });
  it('persists only evidence for statement confirmation', async () => {
    const h = harness(); const params = { businessId: BUSINESS, accountId: ACCOUNT, expectedAccountVersion: 1, sourceNamespace: 'bank-own', csv: 'externalKey,bookedOn,amountMinor,reference\na,2026-10-02,850000,' };
    const preview = previewBankStatement(params, { businessId: BUSINESS, timeZone: bank().timeZone, account: bank().account, existingRows: [] });
    await h.handler.execute(h.tx, mutation({ ...params, type: 'CONFIRM_BANK_STATEMENT', previewToken: preview.previewToken!, reason: 'Importar extracto' }), new Set());
    expect(h.tx.writes.map(write => write.sql.match(/INSERT INTO "(\w+)"/)?.[1])).toEqual(['FinanceBankStatement', 'FinanceBankRow']);
    expect(h.events).toEqual([]); expect(JSON.stringify(h.tx.writes)).not.toContain('externalKey,bookedOn');
  });
  it('recalculates active reservations before any match/fee/link write', async () => {
    const current = bank(); const h = harness(current); const request = bankMutation(current); h.tx.reserved = 1;
    await expect(h.handler.execute(h.tx, request, new Set())).rejects.toThrow('BANK_MATCH_PREVIEW_STALE');
    expect(h.tx.writes).toEqual([]); expect(h.writer.bankFee).not.toHaveBeenCalled(); expect(h.writer.paymentLink).not.toHaveBeenCalled();
    expect(h.tx.queries.filter(query => query.sql.includes('SUM(ABS')).every(query => query.sql.includes("m.state='ACTIVE'"))).toBe(true);
  });
  it('persists actual component FK columns and signed amounts', async () => {
    const current = bank(); const h = harness(current); const request = bankMutation(current);
    const result = await h.handler.execute(h.tx, request, new Set());
    const component = h.tx.writes.find(write => write.sql.includes('FinanceBankMatchComponent'))!;
    expect(component.parameters.slice(5, 10)).toEqual([PAYMENT, null, null, null, null]);
    expect(component.parameters[13]).toBe('1000000'); expect(result.version).toBe(1);
  });
  it('persists the postlink hash/version so an explicit account link does not create an instantly stale match', async () => {
    const current = bank(); current.sources = [{ ...current.sources[0], accountId: null, linkVersion: null }]; const h = harness(current);
    const params = { businessId: BUSINESS, accountId: ACCOUNT, rows: [{ id: ROW, version: 1, amountMinor: 1000000 }], components: [{ sourceId: PAYMENT, sourceType: 'PAYMENT' as const, sourceLeg: null, sourceVersion: 1, sourceHash: 'a'.repeat(64), amountMinor: 1000000 }], paymentLinks: [{ paymentId: PAYMENT, expectedLinkVersion: 0, accountId: ACCOUNT, reason: 'Asignar cuenta' }], fees: [] };
    const preview = previewBankMatch(params, current);
    await h.handler.execute(h.tx, mutation({ ...params, type: 'CONFIRM_BANK_MATCH', previewToken: preview.previewToken!, reason: 'Conciliar' }), new Set());
    const component = h.tx.writes.find(write => write.sql.includes('FinanceBankMatchComponent'))!;
    expect(component.parameters[11]).toBe(2); expect(component.parameters[12]).toBe('b'.repeat(64));
  });
  it('cancels by CAS and keeps historical components, fee origins and economic facts', async () => {
    const h = harness(); h.tx.cancelled = { version: 1, state: 'ACTIVE' };
    expect(await h.handler.execute(h.tx, mutation({ type: 'CANCEL_BANK_MATCH', id: ROW, expectedVersion: 1, reason: 'Revisar evidencia' }), new Set())).toMatchObject({ version: 2 });
    expect(h.tx.writes).toHaveLength(1); expect(h.tx.writes[0].sql).toContain('UPDATE "FinanceBankMatch"');
    expect(h.tx.writes[0].sql).not.toContain('DELETE'); expect(h.events).toEqual([]);
  });
  it('checks cancellation version before no-op and treats failed update as conflict', async () => {
    const h = harness(); h.tx.cancelled = { version: 2, state: 'CANCELLED' };
    await expect(h.handler.execute(h.tx, mutation({ type: 'CANCEL_BANK_MATCH', id: ROW, expectedVersion: 1, reason: 'Cancelar' }), new Set())).rejects.toThrow('BANK_MATCH_VERSION_STALE');
    expect(h.tx.writes).toHaveLength(0);
    h.tx.cancelled = { version: 1, state: 'ACTIVE' }; h.tx.affected = 0;
    await expect(h.handler.execute(h.tx, mutation({ type: 'CANCEL_BANK_MATCH', id: ROW, expectedVersion: 1, reason: 'Cancelar' }), new Set())).rejects.toThrow('BANK_MATCH_VERSION_STALE');
  });
  it('propagates a write failure so the caller transaction can roll back', async () => {
    const current = bank(); const h = harness(current); h.tx.failInsert = true;
    await expect(h.handler.execute(h.tx, bankMutation(current), new Set())).rejects.toThrow('injected write failure');
    expect(h.tx.writes.some(write => write.sql.includes('FinanceBankMatchComponent'))).toBe(false);
  });
});
