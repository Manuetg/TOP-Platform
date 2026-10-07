import type { Prisma } from '@prisma/client';
import { readCurrentPricingClassified, readCurrentPricingClassifiedBatch, readServicePricing, readServicePricingBatch } from './prisma-current-pricing.reader';

interface SnapshotRow {
  id: string;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: bigint;
  items: Prisma.JsonValue;
  createdAt: Date;
}

interface RevisionRow extends SnapshotRow {
  originalSnapshotId: string;
  revisionNumber: number;
  kind: string;
  beforeContext: Prisma.JsonValue;
  afterContext: Prisma.JsonValue;
}

interface BookingRow {
  id: string;
  businessId: string;
  checkInDate: Date | null;
  checkOutDate: Date | null;
  resources: { resourceId: string }[];
}

interface PricingQuery {
  where: { businessId: string; bookingId: { in: string[] }; kind?: string; id?: { in: string[] } };
  orderBy?: { bookingId?: string; revisionNumber?: string }[];
  distinct?: string[];
}

const serviceItems = [{ resourceId: 'room', ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', agreedAmountMinor: 1000, overrideReason: 'Acuerdo', nights: 2, breakdown: [], suggestedAmountMinor: null, adjustmentAmountMinor: null }];
const originalContext = { checkInDate: '2026-09-01', checkOutDate: '2026-09-03', resourceIds: ['room'] };
const amendedContext = { checkInDate: '2026-09-02', checkOutDate: '2026-09-04', resourceIds: ['room'] };

function snapshot(bookingId = 'booking', businessId = 'business'): SnapshotRow {
  return { id: `snapshot-${bookingId}`, bookingId, businessId, currency: 'PYG', totalAmountMinor: 1000n, items: serviceItems, createdAt: new Date('2026-08-01') };
}

function revision(base: SnapshotRow, revisionNumber: number, kind: string, overrides: Partial<RevisionRow> = {}): RevisionRow {
  return { ...base, id: `revision-${base.bookingId}-${revisionNumber}`, originalSnapshotId: base.id, revisionNumber, kind, totalAmountMinor: kind === 'SERVICE' ? 900n : 200n, items: kind === 'SERVICE' ? serviceItems : [], beforeContext: originalContext, afterContext: kind === 'SERVICE' ? amendedContext : { finalAmountMinor: 200, reason: 'Privado' }, ...overrides };
}

function initialBooking(base: SnapshotRow): BookingRow {
  return { id: base.bookingId, businessId: base.businessId, checkInDate: new Date('2026-09-01'), checkOutDate: new Date('2026-09-03'), resources: [{ resourceId: 'room' }] };
}

function fixture(snapshots: SnapshotRow[], revisions: RevisionRow[], bookings = snapshots.map(initialBooking)) {
  const snapshotFindMany = jest.fn(({ where }: PricingQuery) => Promise.resolve(snapshots.filter((row) => row.businessId === where.businessId && where.bookingId.in.includes(row.bookingId))));
  const revisionFindMany = jest.fn(({ where, orderBy, distinct }: PricingQuery) => {
    let matches = revisions.filter((row) => row.businessId === where.businessId && where.bookingId.in.includes(row.bookingId));
    if (where.kind) matches = matches.filter((row) => row.kind === where.kind);
    if (where.id) matches = matches.filter((row) => where.id?.in.includes(row.id));
    if (orderBy) {
      const direction = orderBy.find((order) => order.revisionNumber)?.revisionNumber === 'asc' ? 1 : -1;
      matches.sort((left, right) => (left.bookingId > right.bookingId ? 1 : left.bookingId < right.bookingId ? -1 : 0) || direction * (left.revisionNumber - right.revisionNumber));
    }
    if (distinct) matches = matches.filter((row, index, all) => all.findIndex((candidate) => candidate.bookingId === row.bookingId) === index);
    return Promise.resolve(matches);
  });
  const bookingFindMany = jest.fn(({ where }: { where: { businessId: string; id: { in: string[] } } }) => Promise.resolve(bookings.filter((row) => row.businessId === where.businessId && where.id.in.includes(row.id))));
  const transaction = { pricingSnapshot: { findMany: snapshotFindMany }, pricingRevision: { findMany: revisionFindMany }, booking: { findMany: bookingFindMany } } as unknown as Prisma.TransactionClient;
  return { transaction, snapshotFindMany, revisionFindMany, bookingFindMany };
}

describe('classified current price and agreed SERVICE price', () => {
  it('keeps the latest SERVICE revision while current pricing points to a later terminal amount', async () => {
    const base = snapshot();
    const service = revision(base, 1, 'SERVICE');
    const terminal = revision(base, 2, 'TERMINAL_FINAL_AMOUNT');
    const scope = fixture([base], [service, terminal]);
    expect(await readServicePricing(scope.transaction, 'business', 'booking')).toMatchObject({ id: service.id, kind: 'SERVICE', sourceKind: 'REVISION', totalAmountMinor: 900, sourceContext: amendedContext, items: serviceItems });
    expect(await readCurrentPricingClassified(scope.transaction, 'business', 'booking')).toMatchObject({ id: terminal.id, kind: 'TERMINAL_FINAL_AMOUNT', totalAmountMinor: 200, sourceContext: terminal.afterContext, items: [] });
    expect(scope.revisionFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business', bookingId: { in: ['booking'] }, kind: 'SERVICE' }, orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'desc' }], distinct: ['bookingId'] }));
  });

  it('uses the earliest revision beforeContext for a SERVICE snapshot, preserving lodging before terminal revisions', async () => {
    const base = snapshot();
    const firstTerminal = revision(base, 1, 'TERMINAL_FINAL_AMOUNT');
    const lastTerminal = revision(base, 2, 'TERMINAL_FINAL_AMOUNT', { beforeContext: { finalAmountMinor: 200 }, afterContext: { finalAmountMinor: 100 } });
    const scope = fixture([base], [lastTerminal, firstTerminal]);
    expect(await readServicePricing(scope.transaction, 'business', 'booking')).toMatchObject({ id: base.id, sourceKind: 'SNAPSHOT', kind: 'SERVICE', totalAmountMinor: 1000, sourceContext: originalContext, items: serviceItems });
    expect(scope.revisionFindMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'asc' }], select: { bookingId: true, beforeContext: true } }));
    expect(scope.bookingFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: 'business', id: { in: [] } } }));
  });

  it('uses initial Booking dates and resource IDs only when the snapshot has no revision history', async () => {
    const base = snapshot();
    const scope = fixture([base], []);
    const service = await readServicePricing(scope.transaction, 'business', 'booking');
    expect(service).toMatchObject({ id: base.id, kind: 'SERVICE', sourceKind: 'SNAPSHOT', sourceContext: originalContext });
    const current = await readCurrentPricingClassified(scope.transaction, 'business', 'booking');
    expect(current).toMatchObject({ id: base.id, kind: 'SERVICE', sourceContext: originalContext });
  });

  it('classifies the latest SERVICE revision after an older terminal without resurrecting the older final amount', async () => {
    const base = snapshot();
    const terminal = revision(base, 1, 'TERMINAL_FINAL_AMOUNT');
    const service = revision(base, 2, 'SERVICE');
    const scope = fixture([base], [terminal, service]);
    expect(await readCurrentPricingClassified(scope.transaction, 'business', 'booking')).toMatchObject({ id: service.id, kind: 'SERVICE', totalAmountMinor: 900, sourceContext: amendedContext });
  });

  it('reads a large SERVICE batch in at most four tenant-scoped queries without per-Booking reads', async () => {
    const snapshots = Array.from({ length: 40 }, (_, index) => snapshot(`booking-${index}`));
    const foreign = snapshot('foreign-booking', 'other-business');
    const revisions = snapshots.filter((_, index) => index % 2 === 0).map((base) => revision(base, 1, 'SERVICE'));
    const scope = fixture([...snapshots, foreign], [...revisions, revision(foreign, 1, 'SERVICE')]);
    const bookingIds = snapshots.map((row) => row.bookingId);
    const result = await readServicePricingBatch(scope.transaction, 'business', [...bookingIds, foreign.bookingId]);
    expect(result.size).toBe(40);
    expect(result.has(foreign.bookingId)).toBe(false);
    expect(scope.snapshotFindMany).toHaveBeenCalledTimes(1);
    expect(scope.revisionFindMany).toHaveBeenCalledTimes(2);
    expect(scope.bookingFindMany).toHaveBeenCalledTimes(1);
    for (const [query] of scope.snapshotFindMany.mock.calls) expect(query.where.businessId).toBe('business');
    for (const [query] of scope.revisionFindMany.mock.calls) expect(query.where.businessId).toBe('business');
    for (const [query] of scope.bookingFindMany.mock.calls) expect(query.where.businessId).toBe('business');
  });

  it('reads a classified mixed snapshot/revision batch in at most five tenant-scoped queries', async () => {
    const snapshots = Array.from({ length: 40 }, (_, index) => snapshot(`booking-${index}`));
    const revisions = snapshots.filter((_, index) => index % 2 === 0).map((base) => revision(base, 1, 'TERMINAL_FINAL_AMOUNT'));
    const scope = fixture(snapshots, revisions);
    const result = await readCurrentPricingClassifiedBatch(scope.transaction, 'business', snapshots.map((row) => row.bookingId));
    expect(result.size).toBe(40);
    expect([...result.values()].filter((row) => row.kind === 'TERMINAL_FINAL_AMOUNT')).toHaveLength(20);
    expect(scope.snapshotFindMany).toHaveBeenCalledTimes(1);
    expect(scope.revisionFindMany).toHaveBeenCalledTimes(3);
    expect(scope.bookingFindMany).toHaveBeenCalledTimes(1);
    for (const [query] of scope.revisionFindMany.mock.calls) expect(query.where.businessId).toBe('business');
    for (const [query] of scope.bookingFindMany.mock.calls) expect(query.where.businessId).toBe('business');
  });

  it('makes no database calls for empty batches and returns null for an unknown Booking', async () => {
    const scope = fixture([], []);
    expect((await readServicePricingBatch(scope.transaction, 'business', [])).size).toBe(0);
    expect((await readCurrentPricingClassifiedBatch(scope.transaction, 'business', [])).size).toBe(0);
    expect(scope.snapshotFindMany).not.toHaveBeenCalled();
    expect(scope.revisionFindMany).not.toHaveBeenCalled();
    expect(scope.bookingFindMany).not.toHaveBeenCalled();
    expect(await readServicePricing(scope.transaction, 'business', 'missing')).toBeNull();
    expect(await readCurrentPricingClassified(scope.transaction, 'business', 'missing')).toBeNull();
  });

  it.each(['SERVICE', 'TERMINAL_FINAL_AMOUNT'])('fails closed when a %s revision points to another original snapshot', async (kind) => {
    const base = snapshot();
    const corrupt = revision(base, 1, kind, { originalSnapshotId: 'different-snapshot' });
    const scope = fixture([base], [corrupt]);
    await expect(readCurrentPricingClassified(scope.transaction, 'business', 'booking')).rejects.toThrow('CURRENT_PRICING_SNAPSHOT_INVARIANT');
    if (kind === 'SERVICE') await expect(readServicePricing(scope.transaction, 'business', 'booking')).rejects.toThrow('CURRENT_PRICING_SNAPSHOT_INVARIANT');
  });

  it('fails closed for an unsupported current revision kind or a snapshot without Booking context', async () => {
    const base = snapshot();
    const corrupt = fixture([base], [revision(base, 1, 'UNKNOWN')]);
    await expect(readCurrentPricingClassified(corrupt.transaction, 'business', 'booking')).rejects.toThrow('CURRENT_PRICING_KIND_INVARIANT');
    const orphan = fixture([base], [], []);
    await expect(readServicePricing(orphan.transaction, 'business', 'booking')).rejects.toThrow('SERVICE_PRICING_BOOKING_INVARIANT');
  });
});
