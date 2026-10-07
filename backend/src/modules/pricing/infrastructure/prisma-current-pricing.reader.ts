import type { Prisma, PricingRevision, PricingSnapshot } from '@prisma/client';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { CurrentPricing } from '../domain/current-pricing';
import type { PricingSnapshotItem } from '../domain/pricing-snapshot.repository';

export interface ServicePricing extends CurrentPricing {
  kind: 'SERVICE';
  sourceKind: 'SNAPSHOT' | 'REVISION';
  sourceContext: Prisma.JsonValue;
}

export interface ClassifiedCurrentPricing extends CurrentPricing {
  kind: 'SERVICE' | 'TERMINAL_FINAL_AMOUNT';
  sourceContext: Prisma.JsonValue;
}

export async function readCurrentPricingClassified(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<ClassifiedCurrentPricing | null> {
  return (await readCurrentPricingClassifiedBatch(transaction, businessId, [bookingId])).get(bookingId) ?? null;
}

export async function readCurrentPricingClassifiedBatch(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, ClassifiedCurrentPricing>> {
  const current = await readCurrentPricingBatch(transaction, businessId, bookingIds);
  if (current.size === 0) return new Map();
  const revisionIds = [...current.values()].flatMap((price) => price.pricingRevisionId ? [price.pricingRevisionId] : []);
  const snapshotIds = [...current.values()].filter((price) => !price.pricingRevisionId).map((price) => price.bookingId);
  const [revisions, contexts] = await Promise.all([
    transaction.pricingRevision.findMany({ where: { businessId, bookingId: { in: bookingIds }, id: { in: revisionIds } }, select: { id: true, kind: true, afterContext: true } }),
    readSnapshotContexts(transaction, businessId, snapshotIds),
  ]);
  const byId = new Map(revisions.map((revision) => [revision.id, revision]));
  const result = new Map<string, ClassifiedCurrentPricing>();
  for (const price of current.values()) {
    if (!price.pricingRevisionId) { result.set(price.bookingId, { ...price, kind: 'SERVICE', sourceContext: requireSourceContext(contexts, price.bookingId) }); continue; }
    const revision = byId.get(price.pricingRevisionId);
    if (!revision || !['SERVICE', 'TERMINAL_FINAL_AMOUNT'].includes(revision.kind)) throw new Error('CURRENT_PRICING_KIND_INVARIANT');
    result.set(price.bookingId, { ...price, kind: revision.kind as 'SERVICE' | 'TERMINAL_FINAL_AMOUNT', sourceContext: revision.afterContext });
  }
  return result;
}

/** Terminal final amounts never replace the agreed lodging price used by recognition. */
export async function readServicePricing(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<ServicePricing | null> {
  return (await readServicePricingBatch(transaction, businessId, [bookingId])).get(bookingId) ?? null;
}

export async function readServicePricingBatch(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, ServicePricing>> {
  if (bookingIds.length === 0) return new Map();
  const [snapshots, revisions] = await Promise.all([
    transaction.pricingSnapshot.findMany({ where: { businessId, bookingId: { in: bookingIds } } }),
    transaction.pricingRevision.findMany({ where: { businessId, bookingId: { in: bookingIds }, kind: 'SERVICE' }, orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'desc' }], distinct: ['bookingId'] }),
  ]);
  const latest = new Map(revisions.map((revision) => [revision.bookingId, revision]));
  const contexts = await readSnapshotContexts(transaction, businessId, snapshots.filter((snapshot) => !latest.has(snapshot.bookingId)).map((snapshot) => snapshot.bookingId));
  return new Map(snapshots.map((snapshot) => {
    const revision = latest.get(snapshot.bookingId);
    const price = currentPricing(snapshot, revision);
    const source: ServicePricing = revision ? { ...price, kind: 'SERVICE', sourceKind: 'REVISION', sourceContext: revision.afterContext } : { ...price, kind: 'SERVICE', sourceKind: 'SNAPSHOT', sourceContext: requireSourceContext(contexts, snapshot.bookingId) };
    return [snapshot.bookingId, source];
  }));
}

async function readSnapshotContexts(transaction: Prisma.TransactionClient, businessId: string, bookingIds: string[]): Promise<Map<string, Prisma.JsonValue>> {
  if (bookingIds.length === 0) return new Map();
  const revisions = await transaction.pricingRevision.findMany({ where: { businessId, bookingId: { in: bookingIds } }, orderBy: [{ bookingId: 'asc' }, { revisionNumber: 'asc' }], distinct: ['bookingId'], select: { bookingId: true, beforeContext: true } });
  const contexts = new Map(revisions.map((revision) => [revision.bookingId, revision.beforeContext]));
  const remaining = bookingIds.filter((id) => !contexts.has(id));
  const bookings = await transaction.booking.findMany({ where: { businessId, id: { in: remaining } }, select: { id: true, checkInDate: true, checkOutDate: true, resources: { select: { resourceId: true }, orderBy: { resourceId: 'asc' } } } });
  for (const booking of bookings) contexts.set(booking.id, { checkInDate: booking.checkInDate?.toISOString().slice(0, 10) ?? null, checkOutDate: booking.checkOutDate?.toISOString().slice(0, 10) ?? null, resourceIds: booking.resources.map((resource) => resource.resourceId) });
  return contexts;
}

function requireSourceContext(contexts: Map<string, Prisma.JsonValue>, bookingId: string): Prisma.JsonValue {
  const context = contexts.get(bookingId);
  if (context === undefined) throw new Error('SERVICE_PRICING_BOOKING_INVARIANT');
  return context;
}

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
