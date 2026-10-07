import { evidenceDigest } from './finance-v2-evidence.validation';
import { bankSourceForeignKeys, bankSourceKey, bindBankFeeSettlement, parseBankStatementCsv, previewBankMatch, previewBankStatement, requireBankMatchConfirmation, requireBankStatementConfirmation, suggestBankMatches, type BankFeeInput, type BankMatchInput, type BankMatchSnapshot, type BankRowSnapshot, type BankSourceSnapshot, type BankStatementSnapshot } from './finance-v2-bank-match';

const BUSINESS = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';
const CATEGORY = '00000000-0000-0000-0000-000000000003';
const ROW = '00000000-0000-0000-0000-000000000004';
const PAYMENT = '00000000-0000-0000-0000-000000000005';
const SETTLEMENT = '00000000-0000-0000-0000-000000000006';
const EXPENSE = '00000000-0000-0000-0000-000000000007';
const REFUND = '00000000-0000-0000-0000-000000000008';
const ROW2 = '00000000-0000-0000-0000-000000000009';
function row(amountMinor = 850000, id = ROW): BankRowSnapshot { return { id, businessId: BUSINESS, accountId: ACCOUNT, version: 1, amountMinor, bookedOn: '2026-10-02', reference: 'Lote propio', reservedMinor: 0 }; }
function source(amountMinor = 1000000, overrides: Partial<BankSourceSnapshot> = {}): BankSourceSnapshot {
  return { businessId: BUSINESS, accountId: ACCOUNT, currency: 'PYG', sourceType: 'PAYMENT', sourceId: PAYMENT, sourceLeg: null, sourceVersion: 1, sourceHash: 'a'.repeat(64), amountMinor, occurredAt: '2026-10-02T00:00:00.000Z', bookedOn: '2026-10-02', reference: 'Lote propio', reservedMinor: 0, eligible: true, linkVersion: 1, ...overrides };
}
function snapshot(rows = [row()], sources = [source()]): BankMatchSnapshot {
  return { businessId: BUSINESS, timeZone: 'America/Asuncion', now: '2026-10-05T00:00:00.000Z',
    account: { id: ACCOUNT, businessId: BUSINESS, kind: 'BANK', currency: 'PYG', version: 1, archived: false, opening: { id: 'opening', amountMinor: 0, occurredAt: '2026-10-01T00:00:00.000Z' } },
    policy: { enabled: false, version: 0 }, rows, sources, feeOrigins: [], existingFees: [],
    feeReferences: [{ id: CATEGORY, businessId: BUSINESS, kind: 'CATEGORY', archived: false, version: 1 }],
  };
}
function fee(amount = 150000): BankFeeInput {
  return { bankRowId: ROW, consumedOn: '2026-10-02', occurredAt: '2026-10-02T00:00:00Z', reference: null,
    expenseDefinition: { description: 'Comisión bancaria', amountMinor: amount, counterpartyId: null, reference: null, lines: [{ label: 'Comisión', categoryId: CATEGORY, resourceId: null, bookingId: null, amountMinor: amount, operational: true }] },
  };
}
function input(current = snapshot(), fees: readonly BankFeeInput[] = [fee()]): BankMatchInput {
  return { businessId: BUSINESS, accountId: ACCOUNT, rows: current.rows.map(item => ({ id: item.id, version: item.version, amountMinor: item.amountMinor })),
    components: current.sources.map(item => ({ sourceType: item.sourceType, sourceId: item.sourceId, sourceLeg: item.sourceLeg, sourceVersion: item.sourceVersion, sourceHash: item.sourceHash, amountMinor: item.amountMinor })), paymentLinks: [], fees,
  };
}
function statementSnapshot(): BankStatementSnapshot { const current = snapshot(); return { businessId: BUSINESS, timeZone: current.timeZone, account: current.account, existingRows: [] }; }
describe('FIN-020 bank CSV evidence only', () => {
  it('normalizes signed values, quotes, CRLF and nonsemantic row order', () => {
    const a = parseBankStatementCsv('externalKey,bookedOn,amountMinor,reference\r\na,2026-10-02,1000000,"Lote ""propio"", 1"\r\nb,2026-10-02,-150000,\r\n');
    const b = parseBankStatementCsv('externalKey,bookedOn,amountMinor,reference\nb,2026-10-02,-150000,\na,2026-10-02,1000000,"Lote ""propio"", 1"');
    expect(a.errors).toEqual([]); expect(a.totalMinor).toBe(850000); expect(a.canonicalDigest).toBe(b.canonicalDigest);
  });
  it.each(['0', '1.5', '1e6', '9007199254740992'])('rejects invalid bank amount %s', amount => {
    const result = parseBankStatementCsv(`externalKey,bookedOn,amountMinor,reference\na,2026-10-02,${amount},`);
    expect(result.canonicalDigest).toBeNull(); expect(result.totalMinor).toBeNull();
  });
  it('rejects duplicate keys, aggregate overflow and undeclared currency columns', () => {
    expect(parseBankStatementCsv('externalKey,bookedOn,amountMinor,reference\na,2026-10-02,1,\na,2026-10-02,1,').errors).toContainEqual(expect.objectContaining({ code: 'BANK_ROW_KEY_DUPLICATE' }));
    expect(parseBankStatementCsv('externalKey,bookedOn,amountMinor,reference\na,2026-10-02,9007199254740991,\nb,2026-10-02,1,').totalMinor).toBeNull();
    expect(parseBankStatementCsv('externalKey,bookedOn,amountMinor,reference,currency\na,2026-10-02,1,,USD').canonicalDigest).toBeNull();
  });
  it('preview and exact reimport only return evidence IDs, never cash changes', () => {
    const current = statementSnapshot(); const command = { businessId: BUSINESS, accountId: ACCOUNT, expectedAccountVersion: 1, sourceNamespace: 'bank-own', csv: 'externalKey,bookedOn,amountMinor,reference\na,2026-10-02,850000,' };
    const before = JSON.stringify(current); const first = previewBankStatement(command, current);
    expect(first.valid).toBe(true); expect(first.basis).toBe('EXTERNAL_EVIDENCE_ONLY'); expect(first.registeredCashDeltaMinor).toBe(0); expect(JSON.stringify(current)).toBe(before);
    expect(requireBankStatementConfirmation(command, current, first.previewToken!).valid).toBe(true);
    current.existingRows = [{ id: ROW, businessId: BUSINESS, accountId: ACCOUNT, sourceNamespace: 'bank-own', externalKey: 'a', payloadDigest: evidenceDigest(first.rows[0]) }];
    expect(previewBankStatement(command, current).items[0]).toMatchObject({ status: 'ALREADY_IMPORTED', rowId: ROW });
    current.existingRows = [{ ...current.existingRows[0], payloadDigest: 'changed' }];
    expect(previewBankStatement(command, current).valid).toBe(false);
    expect(() => requireBankStatementConfirmation(command, current, first.previewToken!)).toThrow('BANK_STATEMENT_PREVIEW_STALE');
  });
  it('rejects foreign account, CASH account and stale account version', () => {
    const current = statementSnapshot(); const command = { businessId: BUSINESS, accountId: ACCOUNT, expectedAccountVersion: 1, sourceNamespace: 'bank', csv: 'externalKey,bookedOn,amountMinor,reference\na,2026-10-02,1,' };
    current.account.kind = 'CASH'; expect(previewBankStatement(command, current).valid).toBe(false);
    current.account.kind = 'BANK'; expect(previewBankStatement({ ...command, expectedAccountVersion: 2 }, current).valid).toBe(false);
    current.account.businessId = 'foreign'; expect(previewBankStatement(command, current).valid).toBe(false);
  });
});
describe('FIN-020 matching signed capacities and one fee origin', () => {
  it('keeps gross Payment 1000000 plus fee Settlement -150000 equal to bank 850000', () => {
    const current = snapshot(); const command = input(current); const before = JSON.stringify({ current, command });
    const preview = previewBankMatch(command, current);
    expect(preview.valid).toBe(true); expect(preview.rowTotalMinor).toBe(850000); expect(preview.componentTotalMinor).toBe(850000);
    expect(preview.plannedFeeTotalMinor).toBe(-150000); expect(preview.fees[0]).toMatchObject({ mode: 'CREATE', settlementId: null });
    expect(preview.components[0]).toMatchObject({ paymentId: PAYMENT, paymentAdjustmentId: null, settlementId: null });
    expect(preview.rows[0].status).toBe('MATCHED'); expect(preview.registeredCashDeltaMinor).toBe(0);
    expect(JSON.stringify({ current, command })).toBe(before);
    const realSettlement = source(-150000, { sourceType: 'SETTLEMENT', sourceId: SETTLEMENT, sourceHash: 'b'.repeat(64) });
    expect(bindBankFeeSettlement(preview.fees[0], realSettlement, EXPENSE, BUSINESS, ACCOUNT)).toMatchObject({ settlementId: SETTLEMENT, paymentId: null, amountMinor: -150000 });
  });
  it('matches separate negative REFUND evidence without netting the original PAYMENT twice', () => {
    const refund = source(-100000, { sourceType: 'REFUND', sourceId: REFUND, sourceHash: 'b'.repeat(64) });
    const current = snapshot([row(1000000), row(-100000, ROW2)], [source(), refund]);
    const preview = previewBankMatch(input(current, []), current);
    expect(preview.valid).toBe(true); expect(preview.componentTotalMinor).toBe(900000);
    expect(preview.components.find(item => item.sourceType === 'REFUND')).toMatchObject({ paymentAdjustmentId: REFUND, paymentId: null, amountMinor: -100000 });
  });
  it('supports one source consumed by two rows and exposes partial source residual', () => {
    const current = snapshot([row(200000), row(300000, ROW2)], [source()]); const command = input(current, []);
    command.components = [{ ...command.components[0], amountMinor: 500000 }];
    const preview = previewBankMatch(command, current);
    expect(preview.valid).toBe(true); expect(preview.rows.every(item => item.status === 'MATCHED')).toBe(true);
    expect(preview.sources[0]).toMatchObject({ consumedMinor: 500000, residualMinor: 500000, status: 'PARTIAL' });
  });
  it('supports five Payments, a refund and an existing fee in one bank row', () => {
    const payments = Array.from({ length: 5 }, (_, index) => source(100000, { sourceId: `00000000-0000-0000-0000-${String(20 + index).padStart(12, '0')}` }));
    const current = snapshot([row(430000)], [...payments, source(-50000, { sourceType: 'REFUND', sourceId: REFUND }), source(-20000, { sourceType: 'SETTLEMENT', sourceId: SETTLEMENT })]);
    current.existingFees = [{ businessId: BUSINESS, expenseId: EXPENSE, settlementId: SETTLEMENT, accountId: ACCOUNT, expenseAmountMinor: 20000, settlementAmountMinor: 20000, eligible: true }];
    const preview = previewBankMatch(input(current, [{ bankRowId: ROW, existingExpenseId: EXPENSE, existingSettlementId: SETTLEMENT }]), current);
    expect(preview.valid).toBe(true); expect(preview.componentTotalMinor).toBe(430000); expect(preview.plannedFeeTotalMinor).toBe(0);
  });
  it('retains ACTIVE reservations even when a source was stale and rejects overconsumption', () => {
    const current = snapshot([row(200000)], [source(1000000, { reservedMinor: 900000 })]); const command = input(current, []);
    command.components = [{ ...command.components[0], amountMinor: 200000 }];
    expect(previewBankMatch(command, current).errors).toContainEqual(expect.objectContaining({ code: 'CAPACITY_EXCEEDED' }));
    expect(current.sources[0].reservedMinor).toBe(900000);
    current.rows = [{ ...current.rows[0], reservedMinor: 1 }];
    expect(previewBankMatch(command, current).valid).toBe(false);
  });
  it('rejects VOID Payment eligibility and mismatched source versions/hashes', () => {
    const current = snapshot([row(1000000)]); const command = input(current, []);
    current.sources = [{ ...current.sources[0], eligible: false }];
    expect(previewBankMatch(command, current).staleReasons).toEqual(['SOURCE_INELIGIBLE']);
    current.sources = [{ ...current.sources[0], eligible: true, sourceHash: 'c'.repeat(64) }];
    expect(previewBankMatch(command, current).staleReasons).toEqual(['SOURCE_STALE']);
  });
  it('requires explicit account linking only for an unlinked PAYMENT', () => {
    const current = snapshot([row(1000000)], [source(1000000, { accountId: null, linkVersion: null })]); const command = input(current, []);
    expect(previewBankMatch(command, current).valid).toBe(false);
    command.paymentLinks = [{ paymentId: PAYMENT, expectedLinkVersion: 0, accountId: ACCOUNT, reason: 'Cuenta declarada por operador' }];
    expect(previewBankMatch(command, current).valid).toBe(true);
    current.sources = [{ ...current.sources[0], accountId: ROW2 }];
    expect(previewBankMatch(command, current).valid).toBe(false);
  });
  it('does not create a second fee after a previous match was cancelled', () => {
    const current = snapshot(); current.feeOrigins = [{ businessId: BUSINESS, bankRowId: ROW, expenseId: EXPENSE, settlementId: SETTLEMENT, amountMinor: 150000 }];
    expect(previewBankMatch(input(current), current).errors).toContainEqual(expect.objectContaining({ code: 'FEE_ORIGIN_CONFLICT' }));
  });
  it('approval policy prevents fee creation but allows an already confirmed fee', () => {
    const current = snapshot(); current.policy = { enabled: true, version: 1 };
    expect(previewBankMatch(input(current), current).errors).toContainEqual(expect.objectContaining({ code: 'EXPENSE_APPROVAL_REQUIRED' }));
    current.sources = [...current.sources, source(-150000, { sourceType: 'SETTLEMENT', sourceId: SETTLEMENT })];
    current.existingFees = [{ businessId: BUSINESS, expenseId: EXPENSE, settlementId: SETTLEMENT, accountId: ACCOUNT, expenseAmountMinor: 150000, settlementAmountMinor: 150000, eligible: true }];
    expect(previewBankMatch(input(current, [{ bankRowId: ROW, existingExpenseId: EXPENSE, existingSettlementId: SETTLEMENT }]), current).valid).toBe(true);
  });
  it('requires the exact preview when source capacity or row version changes', () => {
    const current = snapshot(); const command = input(current); const preview = previewBankMatch(command, current);
    expect(requireBankMatchConfirmation(command, current, preview.previewToken!).valid).toBe(true);
    current.sources = [{ ...current.sources[0], reservedMinor: 1 }];
    expect(() => requireBankMatchConfirmation(command, current, preview.previewToken!)).toThrow('BANK_MATCH_PREVIEW_STALE');
  });
  it('suggestions have explicit reasons and remain read-only', () => {
    const current = snapshot([row(1000000)]); const before = JSON.stringify(current);
    const suggestions = suggestBankMatches(current);
    expect(suggestions).toEqual([{ bankRowId: ROW, sourceKey: bankSourceKey(current.sources[0]), amountMinor: 1000000, reasons: ['EXACT_AMOUNT', 'EXACT_DATE', 'EXACT_REFERENCE'], confirmation: 'REQUIRES_EXPLICIT_COMMAND' }]);
    expect(JSON.stringify(current)).toBe(before);
    expect(previewBankMatch({ ...input(current, []), components: [] }, current).valid).toBe(false);
  });
  it.each(['REFUND', 'SETTLEMENT', 'MOVEMENT', 'TRANSFER'] as const)('emits real FK columns for %s and transfer legs select sign', type => {
    const component = { sourceType: type, sourceId: SETTLEMENT, sourceLeg: type === 'TRANSFER' ? 'FROM' as const : null, sourceVersion: 1, sourceHash: 'd'.repeat(64), amountMinor: -1 };
    const columns = bankSourceForeignKeys(component);
    expect(Object.values(columns).filter(value => value !== null)).toEqual([SETTLEMENT]);
    const current = snapshot([row(-1)], [source(-1, component)]);
    expect(previewBankMatch(input(current, []), current).valid).toBe(true);
  });
  it('rejects duplicate refs/rows, incorrect signs, cross tenant and inconsistent sums', () => {
    const current = snapshot([row(1000000)]); const command = input(current, []);
    expect(previewBankMatch({ ...command, rows: [...command.rows, command.rows[0]] }, current).valid).toBe(false);
    expect(previewBankMatch({ ...command, components: [...command.components, command.components[0]] }, current).valid).toBe(false);
    expect(previewBankMatch({ ...command, components: [{ ...command.components[0], amountMinor: -1000000 }] }, current).valid).toBe(false);
    expect(previewBankMatch({ ...command, components: [{ ...command.components[0], amountMinor: 500000 }] }, current).errors).toContainEqual(expect.objectContaining({ code: 'MATCH_SIGNED_SUM_MISMATCH' }));
    current.sources = [{ ...current.sources[0], businessId: 'foreign' }]; expect(previewBankMatch(command, current).valid).toBe(false);
  });
});
