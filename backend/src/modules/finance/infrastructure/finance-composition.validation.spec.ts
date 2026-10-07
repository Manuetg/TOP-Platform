import { parseFinanceV2AsOf, parseFinanceV2PageQuery, parseFinanceV2BankPageQuery, parseFinanceV2ReportQuery, parseFinanceV2Month, parseFinanceHistoryPreview, parseFinanceBankStatementPreview, parseFinanceBankMatchPreview, parseFinancePlanningPreview } from './finance-composition.validation';

const id = '10000000-0000-4000-8000-000000000001';
const now = new Date('2026-10-05T05:00:00.123Z');
const scenario = { asOf: now.toISOString(), horizonTo: '2026-10-20', baseToken: '', accountIds: [id], events: [{ sourceKey: null, direction: 'IN', amountMinor: 100, expectedOn: '2026-10-10', probabilityBasisPoints: 5000, accountId: id, reason: 'Escenario manual' }], excludedSourceKeys: [] };

describe('Finance composition strict public inputs', () => {
  it('defaults to actual server time and canonicalizes an explicit offset', () => {
    expect(parseFinanceV2AsOf(undefined, now)).toBe(now.toISOString());
    expect(parseFinanceV2AsOf('2026-10-05T02:00:00.123-03:00')).toBe(now.toISOString());
  });
  it.each(['2026-02-30T00:00:00Z', '2026-10-05', '2026-10-05T00:00:00', '2026-10-05T24:00:00Z', '2026-10-05T00:00:60Z', '2026-10-05T00:00:00+04:60', 1, null])('rejects invalid asOf %p', value => { expect(() => parseFinanceV2AsOf(value)).toThrow(); });
  it('parses the real UUID cursors and rejects obsolete encoded cursors', () => {
    const cursor = Buffer.from(JSON.stringify({ id, createdAt: now.toISOString() })).toString('base64url');
    expect(parseFinanceV2PageQuery({ cursor: id, limit: '100' })).toEqual({ cursor: id, limit: 100 });
    expect(parseFinanceV2BankPageQuery({ cursor: id, limit: '1' })).toEqual({ cursor: id, limit: 1 });
    expect(() => parseFinanceV2PageQuery({ cursor })).toThrow();
    expect(() => parseFinanceV2BankPageQuery({ cursor })).toThrow();
  });
  it('accepts Express null-prototype query records, retaining strict own keys', () => {
    const query: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    query.limit = '50';
    expect(parseFinanceV2PageQuery(query)).toEqual({ cursor: null, limit: 50 });
    query.actorUserId = id;
    expect(() => parseFinanceV2PageQuery(query)).toThrow();
  });
  it.each(['0', '101', '1.5', '-1', '01', '1e2', ['50'], 50])('bounds pagination without coercion %p', limit => { expect(() => parseFinanceV2PageQuery({ limit })).toThrow(); });
  it('does not normalize a non-existent timestamp inside an encoded cursor', () => {
    const cursor = Buffer.from(JSON.stringify({ id, createdAt: '2026-02-30T00:00:00Z' })).toString('base64url');
    expect(() => parseFinanceV2PageQuery({ cursor })).toThrow();
  });
  it('keeps report token separate from asOf and validates a bounded pure-date interval', () => {
    expect(parseFinanceV2ReportQuery({ from: '2026-10-01', to: '2026-11-01', sourceToken: 'a'.repeat(64) }, now)).toEqual({ from: '2026-10-01', to: '2026-11-01', asOf: now.toISOString(), sourceToken: 'a'.repeat(64) });
  });
  it.each([{ from: '2026-10-01', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-05' }, { from: '2025-01-01', to: '2026-10-01' }, { from: '2026-10-01', to: '2026-11-01', token: 'bad' }])('rejects invalid period %p', query => { expect(() => parseFinanceV2ReportQuery(query)).toThrow(); });
  it.each(['2026-00', '2026-13', '26-01', '2026-1', '0000-01'])('rejects invalid periodMonth %p', periodMonth => { expect(() => parseFinanceV2Month({ periodMonth })).toThrow(); });
  it('reuses strict command rules for CSV previews without requiring a mutation key', () => {
    expect(parseFinanceHistoryPreview({ sourceNamespace: 'demo', csv: 'header\nrow' })).toEqual({ sourceNamespace: 'demo', csv: 'header\nrow' });
    expect(parseFinanceBankStatementPreview({ sourceNamespace: 'demo', csv: 'header\nrow', accountId: id, expectedAccountVersion: 1 }).accountId).toBe(id);
    expect(parseFinanceBankMatchPreview({ accountId: id, rows: [{ id, version: 1, amountMinor: 100 }], components: [], paymentLinks: [], fees: [], reason: 'Conciliar' }).rows).toHaveLength(1);
  });
  it.each(['businessId', 'actorUserId', 'requestId', 'idempotencyKey', 'previewToken', 'type'])('rejects forged preview envelope %s', field => { expect(() => parseFinanceHistoryPreview({ sourceNamespace: 'demo', csv: 'csv', [field]: id })).toThrow(); });
  it('rejects oversized CSV before creating a transaction', () => { expect(() => parseFinanceHistoryPreview({ sourceNamespace: 'demo', csv: 'x'.repeat(256 * 1024 + 1) })).toThrow(); });
  it('keeps manual cash scenarios explicit and money integral', () => { expect(parseFinancePlanningPreview(scenario)).toEqual(scenario); });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, '100'])('rejects scenario money %p', amountMinor => { expect(() => parseFinancePlanningPreview({ ...scenario, events: [{ ...scenario.events[0], amountMinor }] })).toThrow(); });
  it.each([-1, 10001, 0.5, '100'])('rejects probability %p', probabilityBasisPoints => { expect(() => parseFinancePlanningPreview({ ...scenario, events: [{ ...scenario.events[0], probabilityBasisPoints }] })).toThrow(); });
  it('rejects repeated accounts, invented fields and hidden prototype authority', () => {
    expect(() => parseFinancePlanningPreview({ ...scenario, accountIds: [id, id] })).toThrow();
    expect(() => parseFinancePlanningPreview({ ...scenario, paid: 100 })).toThrow();
    const forged: unknown = Object.assign(Object.create({ actorUserId: id }), { sourceNamespace: 'demo', csv: 'csv' });
    expect(() => parseFinanceHistoryPreview(forged)).toThrow();
  });
});
