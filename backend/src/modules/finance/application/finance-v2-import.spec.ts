import { evidenceDigest } from './finance-v2-evidence.validation';
import { CSV_BYTE_LIMIT, parseBoundedCsv } from './finance-v2-bounded-csv';
import { HISTORY_CSV_HEADER, parseHistoryImportCsv, previewHistoryImport, requireHistoryImportConfirmation, type HistoryImportInput, type ImportSnapshot } from './finance-v2-import';

const BUSINESS = '00000000-0000-0000-0000-000000000001';
const ACCOUNT = '00000000-0000-0000-0000-000000000002';
const CATEGORY = '00000000-0000-0000-0000-000000000003';
const EXPENSE = '00000000-0000-0000-0000-000000000004';
const RESOURCE = '00000000-0000-0000-0000-000000000005';
const BOOKING = '00000000-0000-0000-0000-000000000006';
function csvRow(values: Partial<Record<(typeof HISTORY_CSV_HEADER)[number], string>>): string {
  return HISTORY_CSV_HEADER.map(key => { const value = values[key] ?? ''; return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value; }).join(',');
}
function file(...rows: string[]): string { return [HISTORY_CSV_HEADER.join(','), ...rows].join('\n'); }
function opening(extra: Partial<Record<(typeof HISTORY_CSV_HEADER)[number], string>> = {}): string {
  return csvRow({ rowKind: 'OPENING', rowKey: 'opening-1', accountId: ACCOUNT, amountMinor: '1000000', occurredAt: '2026-10-01T00:00:00Z', reason: 'Apertura declarada', ...extra });
}
function expense(extra: Partial<Record<(typeof HISTORY_CSV_HEADER)[number], string>> = {}): string {
  return csvRow({ rowKind: 'EXPENSE_LINE', rowKey: 'line-1', documentKey: 'expense-1', description: 'Servicio externo', consumedOn: '2026-09-20', documentAmountMinor: '900000', lineOrdinal: '1', label: 'Servicio', categoryId: CATEGORY, lineAmountMinor: '900000', operational: 'true', ...extra });
}
function settlement(extra: Partial<Record<(typeof HISTORY_CSV_HEADER)[number], string>> = {}): string {
  return csvRow({ rowKind: 'SETTLEMENT', rowKey: 'settlement-1', accountId: ACCOUNT, expenseDocumentKey: 'expense-1', amountMinor: '300000', occurredAt: '2026-09-25T00:00:00Z', includedInOpening: 'true', ...extra });
}
function snapshot(): ImportSnapshot {
  return { businessId: BUSINESS, timeZone: 'America/Asuncion', now: '2026-10-05T00:00:00.000Z', policy: { enabled: false, version: 0 },
    accounts: [{ id: ACCOUNT, businessId: BUSINESS, version: 1, archived: false, kind: 'BANK', currency: 'PYG', opening: null }],
    catalogs: [{ id: CATEGORY, businessId: BUSINESS, version: 1, archived: false, kind: 'CATEGORY' }],
    resources: [{ id: RESOURCE, businessId: BUSINESS, version: 1, archived: true }],
    bookings: [{ id: BOOKING, businessId: BUSINESS, version: 1, archived: false, resourceId: RESOURCE }],
    expenses: [{ id: EXPENSE, businessId: BUSINESS, version: 2, outstandingMinor: 900000 }], importedItems: [],
  };
}
function input(csv = file(opening(), expense(), settlement())): HistoryImportInput { return { businessId: BUSINESS, sourceNamespace: 'legacy-own-2026', csv }; }
describe('FIN-016 bounded CSV and normalized import', () => {
  it('accepts BOM, CRLF, escaped quotes and signed zero opening', () => {
    const parsed = parseHistoryImportCsv('\ufeff' + file(opening({ amountMinor: '0', reason: 'Declaración "propia", histórica' })).replaceAll('\n', '\r\n') + '\r\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.sources[0]).toMatchObject({ amountMinor: 0, reason: 'Declaración "propia", histórica' });
  });
  it('canonicalizes document line ordinals and nonsemantic file order', () => {
    const first = expense({ rowKey: 'line-2', lineOrdinal: '2', lineAmountMinor: '400000' });
    const second = expense({ lineAmountMinor: '500000' });
    const a = parseHistoryImportCsv(file(opening(), first, second, settlement()));
    const b = parseHistoryImportCsv(file(settlement(), second, opening(), first));
    expect(a.errors).toEqual([]);
    expect(a.canonicalDigest).toEqual(b.canonicalDigest);
    expect(a.sources.find(source => source.kind === 'EXPENSE')).toMatchObject({ rowKeys: ['line-1', 'line-2'] });
  });
  it.each(['1.1', '1e3', '9007199254740992', '-1', '01', 'NaN'])('rejects invalid expense amount %s without a digest', value => {
    expect(parseHistoryImportCsv(file(expense({ documentAmountMinor: value }))).canonicalDigest).toBeNull();
  });
  it.each([
    [file(expense(), expense()), 'ROW_KEY_DUPLICATE'],
    [file(expense(), expense({ rowKey: 'another' })), 'LINE_ORDINAL_DUPLICATE'],
    [file(expense(), opening({ rowKey: 'expense-1' })), 'SOURCE_KEY_DUPLICATE'],
    [file(expense({ lineAmountMinor: '1' })), 'EXPENSE_SUM_MISMATCH'],
    [file(expense({ lineAmountMinor: '400000' }), expense({ rowKey: 'another', lineOrdinal: '2', lineAmountMinor: '500000', description: 'Otra metadata' })), 'DOCUMENT_METADATA_MISMATCH'],
    [file(settlement()), 'EXPENSE_DOCUMENT_NOT_FOUND'],
    [file(settlement({ expenseId: EXPENSE })), 'EXPENSE_REFERENCE_XOR'],
    [file(opening({ description: 'Dato ignorado' })), 'INAPPLICABLE_COLUMN'],
    [file(opening(), opening({ rowKey: 'opening-2' })), 'OPENING_ACCOUNT_DUPLICATE'],
    [file(expense({ consumedOn: '2026-02-30' })), 'DATE_INVALID'],
    [file(opening({ occurredAt: '2026-10-01T25:00:00Z' })), 'INSTANT_INVALID'],
  ])('rejects complete import on structural conflict', (csv, code) => {
    const parsed = parseHistoryImportCsv(csv);
    expect(parsed.errors.map(error => error.code)).toContain(code);
    expect(parsed.canonicalDigest).toBeNull();
  });
  it.each([
    ['x,y\n1,2', ['x', 'y'], { bytes: 1 }, 'CSV_BYTE_LIMIT'],
    ['x,y\n123,2', ['x', 'y'], { fieldCharacters: 2 }, 'CSV_FIELD_LIMIT'],
    ['x,y\n1,2\n3,4', ['x', 'y'], { rows: 1 }, 'CSV_ROW_LIMIT'],
    ['x,y\n"abc,2', ['x', 'y'], {}, 'CSV_UNCLOSED_QUOTE'],
    ['x,y\n"abc"x,2', ['x', 'y'], {}, 'CSV_AFTER_QUOTE'],
    ['x,y\nabc"x,2', ['x', 'y'], {}, 'CSV_UNEXPECTED_QUOTE'],
    ['x,y\r1,2', ['x', 'y'], {}, 'CSV_NEWLINE_INVALID'],
    ['x,y\n1,2,3', ['x', 'y'], {}, 'CSV_COLUMN_COUNT'],
    ['x,y\n1', ['x', 'y'], {}, 'CSV_COLUMN_COUNT'],
    ['z,y\n1,2', ['x', 'y'], {}, 'CSV_HEADER_INVALID'],
    ['x,y', ['x', 'y'], {}, 'CSV_ROWS_REQUIRED'],
    ['x,y\n\ud800,2', ['x', 'y'], {}, 'CSV_UTF8_INVALID'],
  ])('enforces bounded and closed CSV grammar', (csv, header, limits, code) => {
    expect(() => parseBoundedCsv(csv, header, limits)).toThrow(code);
  });
  it('bounds UTF-8 bytes rather than character count and source count', () => {
    const oversized = 'é'.repeat(CSV_BYTE_LIMIT / 2 + 1);
    expect(() => parseBoundedCsv(oversized, ['x'])).toThrow('CSV_BYTE_LIMIT');
    const many = Array.from({ length: 201 }, (_, index) => expense({ rowKey: `line-${index}`, documentKey: `doc-${index}` }));
    expect(parseHistoryImportCsv(file(...many)).errors).toContainEqual(expect.objectContaining({ code: 'IMPORT_SOURCE_LIMIT' }));
  });
});
describe('FIN-016 read-only previews and cross references', () => {
  it('excludes only explicitly declared preopening settlement from cash and includes equality', () => {
    const before = previewHistoryImport(input(), snapshot());
    expect(before.valid).toBe(true);
    expect(before.cash).toEqual({ includedDeltaMinor: 0, excludedSettlementMinor: 300000, openingDeclaredMinor: 1000000 });
    const atCut = previewHistoryImport(input(file(opening(), expense(), settlement({ occurredAt: '2026-10-01T00:00:00Z', includedInOpening: 'false' }))), snapshot());
    expect(atCut.cash.includedDeltaMinor).toBe(-300000);
  });
  it('never writes or mutates the snapshot or caller input', () => {
    const current = snapshot(); const command = input(); const before = JSON.stringify({ current, command });
    expect(previewHistoryImport(command, current).valid).toBe(true);
    expect(JSON.stringify({ current, command })).toBe(before);
  });
  it('returns existing IDs with zero additional cash and tolerates active approval for exact replay', () => {
    const current = snapshot(); const command = input(); const parsed = parseHistoryImportCsv(command.csv);
    current.policy.enabled = true;
    current.importedItems = parsed.sources.map(source => ({ businessId: BUSINESS, sourceNamespace: command.sourceNamespace, externalKey: source.externalKey, payloadDigest: evidenceDigest(source), kind: source.kind, sourceId: EXPENSE }));
    const result = previewHistoryImport(command, current);
    expect(result.valid).toBe(true);
    expect(result.items.every(item => item.status === 'ALREADY_IMPORTED' && item.sourceId === EXPENSE)).toBe(true);
    expect(result.cash).toEqual({ includedDeltaMinor: 0, excludedSettlementMinor: 0, openingDeclaredMinor: 0 });
    current.importedItems = [{ ...current.importedItems[0], payloadDigest: 'different' }];
    expect(previewHistoryImport(command, current).errors).toContainEqual(expect.objectContaining({ code: 'IMPORT_KEY_CONFLICT' }));
  });
  it('rejects policy bypass, tenant refs, booking mismatch and unavailable accounts', () => {
    const current = snapshot(); current.policy.enabled = true;
    expect(previewHistoryImport(input(), current).errors).toContainEqual(expect.objectContaining({ code: 'EXPENSE_APPROVAL_REQUIRED' }));
    current.policy.enabled = false; current.catalogs = current.catalogs.map(ref => ({ ...ref, businessId: 'foreign' }));
    expect(previewHistoryImport(input(), current).errors).toContainEqual(expect.objectContaining({ code: 'REFERENCE_NOT_FOUND' }));
    expect(previewHistoryImport(input(file(expense({ bookingId: BOOKING }))), snapshot()).errors).toContainEqual(expect.objectContaining({ code: 'BOOKING_RESOURCE_MISMATCH' }));
    expect(previewHistoryImport(input(file(expense({ resourceId: RESOURCE, bookingId: BOOKING }))), snapshot()).valid).toBe(true);
    const archived = snapshot(); archived.accounts = archived.accounts.map(ref => ({ ...ref, archived: true }));
    expect(previewHistoryImport(input(), archived).valid).toBe(false);
  });
  it('aggregates all new settlements against canonical obligation capacity', () => {
    const command = input(file(opening(), expense(), settlement({ amountMinor: '600000' }), settlement({ rowKey: 'settlement-2', amountMinor: '600000' })));
    const result = previewHistoryImport(command, snapshot());
    expect(result.valid).toBe(false); expect(result.previewToken).toBeNull();
    expect(result.errors).toContainEqual(expect.objectContaining({ code: 'EXPENSE_CAPACITY_EXCEEDED' }));
  });
  it('checks existing expense capacity and opening requirement independently', () => {
    const command = input(file(settlement({ expenseDocumentKey: '', expenseId: EXPENSE })));
    const current = snapshot();
    expect(previewHistoryImport(command, current).errors).toContainEqual(expect.objectContaining({ code: 'OPENING_REQUIRED' }));
    current.accounts = current.accounts.map(ref => ({ ...ref, opening: { id: 'opening', amountMinor: 1000000, occurredAt: '2026-10-01T00:00:00.000Z' } }));
    expect(previewHistoryImport(command, current).valid).toBe(true);
  });
  it('invalidates confirmation after a relevant version/policy change', () => {
    const command = input(); const current = snapshot(); const preview = previewHistoryImport(command, current);
    expect(requireHistoryImportConfirmation(command, current, preview.previewToken!).valid).toBe(true);
    current.accounts = current.accounts.map(ref => ({ ...ref, version: ref.version + 1 }));
    expect(() => requireHistoryImportConfirmation(command, current, preview.previewToken!)).toThrow('IMPORT_PREVIEW_STALE');
  });
  it('rejects includedInOpening at or after cut and future settlement timestamps', () => {
    expect(previewHistoryImport(input(file(opening(), expense(), settlement({ occurredAt: '2026-10-01T00:00:00Z' }))), snapshot()).errors).toContainEqual(expect.objectContaining({ code: 'OPENING_INCLUSION_MISMATCH' }));
    expect(previewHistoryImport(input(file(opening(), expense(), settlement({ occurredAt: '2026-10-06T00:00:00Z', includedInOpening: 'false' }))), snapshot()).errors).toContainEqual(expect.objectContaining({ code: 'FUTURE_OCCURRED_AT' }));
  });
});
