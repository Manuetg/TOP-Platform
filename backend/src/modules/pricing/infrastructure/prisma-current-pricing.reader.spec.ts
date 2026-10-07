import type { Prisma } from '@prisma/client';
import { readCurrentPricing, readCurrentPricingBatch } from './prisma-current-pricing.reader';

describe('Current pricing tenant-safe revision lookup', () => {
  const original = { id: 'original', businessId: 'business', bookingId: 'booking', currency: 'PYG', totalAmountMinor: 100n, items: [], createdAt: new Date('2026-10-01') };
  const revision = { ...original, id: 'revision', originalSnapshotId: 'original', revisionNumber: 2, totalAmountMinor: 80n };
  const snapshots = jest.fn(); const revisions = jest.fn();
  const transaction = { pricingSnapshot: { findMany: snapshots }, pricingRevision: { findMany: revisions } } as unknown as Prisma.TransactionClient;
  beforeEach(() => { snapshots.mockReset().mockResolvedValue([original]); revisions.mockReset().mockResolvedValue([]); });

  it('falls back to the immutable original and selects the latest applicable revision', async () => {
    expect(await readCurrentPricing(transaction, 'business', 'booking')).toMatchObject({ id: 'original', originalSnapshotId: 'original', pricingRevisionId: null, revisionNumber: 0, totalAmountMinor: 100 });
    revisions.mockResolvedValue([revision]);
    expect(await readCurrentPricing(transaction, 'business', 'booking')).toMatchObject({ id: 'revision', originalSnapshotId: 'original', pricingRevisionId: 'revision', revisionNumber: 2, totalAmountMinor: 80 });
    expect(snapshots).toHaveBeenLastCalledWith({ where: { businessId: 'business', bookingId: { in: ['booking'] } } });
    expect(revisions).toHaveBeenLastCalledWith(expect.objectContaining({ where: { businessId: 'business', bookingId: { in: ['booking'] } }, orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'desc' }] }));
  });

  it('does not invent pricing for a legacy booking without Snapshot or perform queries for an empty page', async () => {
    snapshots.mockResolvedValue([]);
    expect(await readCurrentPricing(transaction, 'business', 'missing')).toBeNull();
    snapshots.mockClear(); revisions.mockClear();
    expect(await readCurrentPricingBatch(transaction, 'business', [])).toEqual(new Map());
    expect(snapshots).not.toHaveBeenCalled(); expect(revisions).not.toHaveBeenCalled();
  });

  it('rejects mismatched provenance and amounts that cannot be represented safely', async () => {
    revisions.mockResolvedValue([{ ...revision, originalSnapshotId: 'other' }]);
    await expect(readCurrentPricing(transaction, 'business', 'booking')).rejects.toThrow('CURRENT_PRICING_SNAPSHOT_INVARIANT');
    revisions.mockResolvedValue([{ ...revision, totalAmountMinor: BigInt(Number.MAX_SAFE_INTEGER) + 1n }]);
    await expect(readCurrentPricing(transaction, 'business', 'booking')).rejects.toThrow();
  });
});
