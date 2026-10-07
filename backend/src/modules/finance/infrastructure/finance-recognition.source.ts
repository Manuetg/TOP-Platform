import type { FinanceRecognitionPublicReaders } from './finance-recognition.readers';
import type { ServicePricingBasis } from '../domain/finance-recognition.types';
import { recognitionDate, recognitionRequire } from '../domain/finance-recognition.support';
import { recognitionHash } from './finance-recognition.db';

type ServicePrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['servicePricing']>>>;
type CurrentPrice = NonNullable<Awaited<ReturnType<FinanceRecognitionPublicReaders['currentPricing']>>>;
export function mapServicePricingBasis(price: ServicePrice): ServicePricingBasis {
  recognitionRequire(price.kind === 'SERVICE' && price.items.length === 1, 'SERVICE_SOURCE_CONFLICT', 'Se requiere un único item de alojamiento en precio SERVICE.');
  const context = price.sourceContext;
  recognitionRequire(context !== null && typeof context === 'object' && !Array.isArray(context) && typeof context.checkInDate === 'string' && typeof context.checkOutDate === 'string', 'SERVICE_SOURCE_CONFLICT', 'El precio requiere contexto de estancia inmutable.');
  recognitionDate(context.checkInDate); recognitionDate(context.checkOutDate);
  const item = price.items[0];
  recognitionRequire(Array.isArray(context.resourceIds) && context.resourceIds.length === 1 && context.resourceIds[0] === item.resourceId, 'SERVICE_SOURCE_CONFLICT', 'El precio y contexto no conservan el mismo Resource.');
  return { businessId: price.businessId, bookingId: price.bookingId, resourceId: item.resourceId, originalSnapshotId: price.originalSnapshotId, sourceId: price.id, serviceRevisionId: price.pricingRevisionId, revisionNumber: price.revisionNumber, sourceHash: recognitionHash({ kind: price.kind, id: price.id, originalSnapshotId: price.originalSnapshotId, pricingRevisionId: price.pricingRevisionId, revisionNumber: price.revisionNumber, currency: price.currency, totalAmountMinor: price.totalAmountMinor, items: price.items, sourceContext: context }), currency: price.currency, checkInDate: context.checkInDate, checkOutDate: context.checkOutDate, mode: item.pricingMode, totalAmountMinor: price.totalAmountMinor, agreedAmountMinor: item.agreedAmountMinor, suggestedAmountMinor: item.suggestedAmountMinor, adjustmentAmountMinor: item.adjustmentAmountMinor, overrideReason: item.overrideReason, nights: item.nights, breakdown: item.breakdown.map(night => ({ date: night.date, amountMinor: night.amountMinor })) };
}
export function terminalRecognitionSourceHash(price: Pick<CurrentPrice, 'id' | 'originalSnapshotId' | 'pricingRevisionId' | 'revisionNumber' | 'currency' | 'totalAmountMinor' | 'items' | 'sourceContext'>): string {
  return recognitionHash({ kind: 'TERMINAL_FINAL_AMOUNT', id: price.id, originalSnapshotId: price.originalSnapshotId, pricingRevisionId: price.pricingRevisionId, revisionNumber: price.revisionNumber, currency: price.currency, totalAmountMinor: price.totalAmountMinor, items: price.items, sourceContext: price.sourceContext });
}
