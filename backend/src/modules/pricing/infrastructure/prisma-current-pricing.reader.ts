import type { Prisma, PricingRevision, PricingSnapshot } from '@prisma/client';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { CurrentPricing } from '../domain/current-pricing';
import type { PricingSnapshotItem } from '../domain/pricing-snapshot.repository';

export async function readCurrentPricing(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<CurrentPricing | null> {
  const prices = await readCurrentPricingBatch(transaction, businessId, [bookingId]);
  return prices.get(bookingId) ?? null;
}

export async function readCurrentPricingBatch(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, CurrentPricing>> {
  const result = new Map<string, CurrentPricing>();
  if (bookingIds.length === 0) return result;
  const [snapshots, revisions] = await Promise.all([
    transaction.pricingSnapshot.findMany({ where: { businessId, bookingId: { in: bookingIds } } }),
    transaction.pricingRevision.findMany({ where: { businessId, bookingId: { in: bookingIds } }, orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'desc' }], distinct: ['bookingId'] }),
  ]);
  const latest = new Map(revisions.map((revision) => [revision.bookingId, revision]));
  for (const snapshot of snapshots) {
    result.set(snapshot.bookingId, currentPricing(snapshot, latest.get(snapshot.bookingId)));
  }
  return result;
}

function currentPricing(snapshot: PricingSnapshot, revision: PricingRevision | undefined): CurrentPricing {
  if (revision && revision.originalSnapshotId !== snapshot.id) throw new Error('CURRENT_PRICING_SNAPSHOT_INVARIANT');
  const price = revision ?? snapshot;
  const totalAmountMinor = fromPrismaMoney(price.totalAmountMinor);
  if (totalAmountMinor < 0) throw new Error('CURRENT_PRICING_AMOUNT_INVARIANT');
  return {
    id: price.id, businessId: snapshot.businessId, bookingId: snapshot.bookingId, originalSnapshotId: snapshot.id,
    pricingRevisionId: revision?.id ?? null, revisionNumber: revision?.revisionNumber ?? 0,
    currency: price.currency, totalAmountMinor, items: price.items as unknown as PricingSnapshotItem[], createdAt: price.createdAt,
  };
}
