import type { Prisma } from '@prisma/client';
import { readFinanceServiceEvidence, readFinanceServiceEvidenceBatch, listFinanceServiceEvidence } from '../../booking/booking.contract';
import { readCurrentPricingClassified, readCurrentPricingClassifiedBatch, readServicePricing, readServicePricingBatch } from '../../pricing/pricing.contract';
import { readPaymentMoneySourcesForFinance, readPaymentClosingSources } from '../../payment/payment.contract';
import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { evidenceInstant } from '../application/finance-v2-evidence.validation';
import type { FinanceRecognitionPublicReaders, FinanceRecognitionCostReader } from './finance-recognition.readers';
import type { BookingCostReferenceReader } from './finance-v2-expense.writer';
import type { FinancePublicPaymentMoneyReader } from './finance-v2-bank-source.sql-reader';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import { adaptTransaction, nativeFinanceTransaction } from './finance-v2-prisma-sql.adapter';
import { readFinanceCostSources } from './finance-v2-cost.reader';
import { FinanceV2ReceivableReader } from './finance-v2-receivable.reader';
import type { FinanceBookingFinancialBasis, FinancePaymentObligationBasis } from '../application/finance-v2-receivable.rules';
import { assertFinancePublicPaymentCurrentProvenance } from './finance-v2-payment.cut';

/** The SQL adapter owns the mapping; a caller cannot provide an unrelated native transaction. */
export function financeNativeTransaction(tx: FinanceSqlTransaction): Prisma.TransactionClient {
  return nativeFinanceTransaction(tx) as Prisma.TransactionClient;
}

export const financeRecognitionPublicReaders: FinanceRecognitionPublicReaders = {
  evidence: readFinanceServiceEvidence, evidenceBatch: readFinanceServiceEvidenceBatch,
  candidates: listFinanceServiceEvidence, servicePricing: readServicePricing, servicePricingBatch: readServicePricingBatch,
  currentPricing: readCurrentPricingClassified, currentPricingBatch: readCurrentPricingClassifiedBatch,
};

export const financeRecognitionCostReader: FinanceRecognitionCostReader = {
  read: (tx, input) => readFinanceCostSources(adaptTransaction(tx), input),
};

export const financeBookingCostReader: BookingCostReferenceReader = {
  async read(tx, businessId, bookingId) {
    const evidence = await readFinanceServiceEvidence(financeNativeTransaction(tx), businessId, bookingId);
    if (!evidence) return null;
    return { id: evidence.bookingId, resourceId: evidence.resourceIds.length === 1 ? evidence.resourceIds[0] : null, updatedAt: evidence.bookingUpdatedAt, status: evidence.status };
  },
};

export const financePaymentMoneyReader: FinancePublicPaymentMoneyReader = {
  moneySources: (tx, businessId) => readPaymentMoneySourcesForFinance(financeNativeTransaction(tx), businessId),
};

export async function readFinanceBookingPricing(tx: FinanceSqlTransaction, businessId: string, asOf: string): Promise<FinanceBookingFinancialBasis[]> {
  const cut = receivableCut(asOf);
  const native = financeNativeTransaction(tx);
  const bookings = await listFinanceServiceEvidence(native, { businessId, from: '0001-01-01', to: '9999-12-31', asOf: cut.toISOString(), limit: 5000 });
  const prices = await readCurrentPricingClassifiedBatch(native, businessId, bookings.map(row => row.bookingId));
  return bookings.map(booking => {
    const price = prices.get(booking.bookingId);
    validatePriceScope(price, businessId);
    requireReceivableSourceCut(booking, price, businessId, cut);
    const pricingStatus = !price ? 'MISSING' : booking.status === 'AT_RISK' ? 'REVIEW' : 'CURRENT';
    return { bookingId: booking.bookingId, sourceVersion: Math.max(1, price?.revisionNumber ?? 0), currency: 'PYG', pricingStatus, agreedMinor: price?.totalAmountMinor ?? null, pricingToken: JSON.stringify({ bookingUpdatedAt: booking.bookingUpdatedAt, status: booking.status, price: price ?? null }) };
  });
}

function receivableCut(asOf: string): Date {
  let normalized: string;
  try { normalized = evidenceInstant(asOf, 'asOf'); } catch { throw new FinanceInputError('Corte de obligaciones inválido.'); }
  const cut = new Date(normalized);
  if (cut.getTime() > Date.now()) throw new FinanceInputError('El corte de obligaciones no admite un instante futuro.');
  return cut;
}

function requireReceivableSourceCut(booking: Awaited<ReturnType<typeof listFinanceServiceEvidence>>[number], price: Awaited<ReturnType<typeof readCurrentPricingClassified>> | undefined, businessId: string, cut: Date): void {
  const updated = Date.parse(booking.bookingUpdatedAt);
  if (booking.businessId !== businessId || (price && price.bookingId !== booking.bookingId)) throw new FinanceConflictError('La obligación no conserva su origen propio.');
  if (!Number.isFinite(updated) || updated > cut.getTime()) throw new FinanceConflictError('SOURCE_STALE');
  if (price && (!Number.isFinite(price.createdAt.getTime()) || price.createdAt > cut)) throw new FinanceConflictError('SOURCE_STALE');
}

function validatePriceScope(price: Awaited<ReturnType<typeof readCurrentPricingClassified>> | undefined, businessId: string): void {
  if (price && (price.businessId !== businessId || price.currency !== 'PYG')) throw new FinanceConflictError('La obligación no conserva su precio propio en PYG.');
}

export function financeJsonRecord(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FinanceConflictError('La fuente pública no conserva el objeto esperado.');
  return value as Record<string, Prisma.JsonValue>;
}

export function financeJsonRows(value: Prisma.JsonValue | undefined): Record<string, Prisma.JsonValue>[] {
  if (!Array.isArray(value)) throw new FinanceConflictError('La fuente pública no conserva la lista completa.');
  return value.map(financeJsonRecord);
}

export async function readFinancePaymentObligations(tx: FinanceSqlTransaction, businessId: string, asOf: string): Promise<FinancePaymentObligationBasis> {
  const cut = receivableCut(asOf);
  const native = financeNativeTransaction(tx);
  const currentDate = new Date();
  const current = await readPaymentClosingSources(native, businessId, currentDate);
  assertFinancePublicPaymentCurrentProvenance(businessId, cut.toISOString(), current);
  const source = await readPaymentClosingSources(native, businessId, cut);
  const payload = financeJsonRecord(source.payload);
  // Payment's public closing reader validates scope, safe money, conservation and these exact fields.
  return { complete: source.complete, token: source.sourceToken,
    payments: financeJsonRows(payload.payments) as unknown as FinancePaymentObligationBasis['payments'],
    paymentPlans: financeJsonRows(payload.paymentPlans) as unknown as FinancePaymentObligationBasis['paymentPlans'],
    installments: financeJsonRows(payload.installments) as unknown as FinancePaymentObligationBasis['installments'],
    applications: financeJsonRows(payload.applications) as unknown as FinancePaymentObligationBasis['applications'] };
}

export const financeReceivableReader = new FinanceV2ReceivableReader({ bookingPricing: readFinanceBookingPricing, paymentObligations: readFinancePaymentObligations });
