import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { listFinanceServiceEvidence, type FinanceBookingServiceEvidence } from '../../booking/booking.contract';
import { readCurrentPricingClassifiedBatch, readServicePricingBatch, type ClassifiedCurrentPricing, type ServicePricing } from '../../pricing/pricing.contract';
import { readEffectivePayments, readRecordedPaymentsForFinance, readPaymentClosingSources, needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING, type EffectivePaymentProjection, type FinancePaymentSource } from '../../payment/payment.contract';
import { FinanceConflictError } from '../domain/finance.errors';
import type { FinanceCorrectionBooking, FinanceCorrectionPayment, FinanceCorrectionsData, FinanceEffectiveAmounts } from '../domain/finance-corrections.types';
import { stableFinanceJson } from '../application/finance.use-cases';
import { safeMoney } from '../domain/finance-money';

type PlanState = NonNullable<Parameters<typeof needsPaymentReconciliation>[2]>;
type Link = { paymentId: string; accountId: string | null; version: number };

export async function readFinanceCorrections(transaction: Prisma.TransactionClient, businessId: string, timeZone: string): Promise<FinanceCorrectionsData> {
  const asOf = new Date();
  const [evidence, originals, links, closing] = await Promise.all([
    listFinanceServiceEvidence(transaction, { businessId, from: '0001-01-01', to: '9999-12-31', asOf: asOf.toISOString(), limit: 5000 }),
    readRecordedPaymentsForFinance(transaction, businessId),
    transaction.financePaymentLink.findMany({ where: { businessId }, orderBy: { paymentId: 'asc' }, take: 5001, select: { paymentId: true, accountId: true, version: true } }),
    readPaymentClosingSources(transaction, businessId, asOf),
  ]);
  requireSourceLimit(originals.length); requireSourceLimit(links.length);
  if (!closing.complete) throw new FinanceConflictError('El corte de los planes cambió; actualice la consulta de correcciones.');
  const bookingIds = evidence.map((booking) => booking.bookingId);
  const [current, service, effective] = await Promise.all([readCurrentPricingClassifiedBatch(transaction, businessId, bookingIds), readServicePricingBatch(transaction, businessId, bookingIds), readEffectivePayments(transaction, businessId, bookingIds)]);
  const byOriginal = new Map(originals.map((payment) => [payment.id, payment]));
  const byLink = new Map(links.map((link) => [link.paymentId, link]));
  const plans = closingPlanStates(closing.payload);
  requireCorrectionSources(originals, evidence, current);
  const bookings = evidence.filter((booking) => current.has(booking.bookingId)).map((booking) => correctionBooking(booking, current.get(booking.bookingId)!, service.get(booking.bookingId), effective.filter((payment) => payment.bookingId === booking.bookingId), byOriginal, byLink, plans.get(booking.bookingId) ?? null));
  const capabilities = { voidPayment: true, refundPayment: true, terminalFinalAmount: true };
  const token = createHash('sha256').update(stableFinanceJson({ businessId, currency: 'PYG', timeZone, bookings, capabilities, closingSourceToken: closing.sourceToken })).digest('hex');
  return { businessId, currency: 'PYG', timeZone, asOf: asOf.toISOString(), token, bookings, capabilities, sourceLimit: 5000 };
}

function requireSourceLimit(count: number): void { if (count > 5000) throw new FinanceConflictError('Las correcciones exceden el límite de 5000 fuentes; no se entrega una lista truncada.'); }

function requireCorrectionSources(payments: FinancePaymentSource[], evidence: FinanceBookingServiceEvidence[], prices: Map<string, ClassifiedCurrentPricing>): void {
  const bookingIds = new Set(evidence.map((booking) => booking.bookingId));
  if (payments.some((payment) => !bookingIds.has(payment.bookingId) || !prices.has(payment.bookingId))) throw new FinanceConflictError('Un cobro no conserva una reserva y precio persistido dentro del conjunto completo.');
}

function correctionBooking(booking: FinanceBookingServiceEvidence, price: ClassifiedCurrentPricing, service: ServicePricing | undefined, states: EffectivePaymentProjection[], originals: Map<string, FinancePaymentSource>, links: Map<string, Link>, plan: PlanState | null): FinanceCorrectionBooking {
  if (price.currency !== 'PYG') throw new FinanceConflictError('La reserva requiere un precio persistido en PYG.');
  const amounts = aggregateAmounts(states);
  const financialVersion = safeMoney(states.reduce((sum, payment) => sum + BigInt(payment.paymentVersion), 0n));
  const needsReconciliation = needsPaymentReconciliation(price, amounts.netRetainedAmountMinor, plan);
  return { bookingId: booking.bookingId, label: booking.bookingId, status: booking.status, bookingUpdatedAt: booking.bookingUpdatedAt, resourceIds: booking.resourceIds, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate,
    pricing: { currentPricingId: price.id, originalSnapshotId: price.originalSnapshotId, pricingRevisionId: price.pricingRevisionId, revisionNumber: price.revisionNumber, kind: price.kind, currency: 'PYG', totalAmountMinor: price.totalAmountMinor }, financialVersion, amounts,
    outstandingMinor: Math.max(price.totalAmountMinor - amounts.netRetainedAmountMinor, 0), creditMinor: Math.max(amounts.netRetainedAmountMinor - price.totalAmountMinor, 0), needsReconciliation, canSetTerminalFinalAmount: canSetTerminal(booking, service), payments: states.map((payment) => correctionPayment(payment, originals, links)), warnings: needsReconciliation ? [PAYMENT_RECONCILIATION_WARNING] : [] };
}

function aggregateAmounts(payments: EffectivePaymentProjection[]): FinanceEffectiveAmounts {
  const sum = (field: keyof FinanceEffectiveAmounts) => safeMoney(payments.reduce((total, payment) => total + BigInt(payment[field]), 0n));
  return { grossRecordedAmountMinor: sum('grossRecordedAmountMinor'), voidedAmountMinor: sum('voidedAmountMinor'), refundedAmountMinor: sum('refundedAmountMinor'), netRetainedAmountMinor: sum('netRetainedAmountMinor') };
}

function correctionPayment(payment: EffectivePaymentProjection, originals: Map<string, FinancePaymentSource>, links: Map<string, Link>): FinanceCorrectionPayment {
  const original = originals.get(payment.paymentId);
  if (!original || original.bookingId !== payment.bookingId || original.amountMinor !== payment.grossRecordedAmountMinor) throw new FinanceConflictError('La proyección efectiva perdió su cobro original.');
  const link = links.get(payment.paymentId);
  return { id: payment.paymentId, bookingId: payment.bookingId, paidAt: original.paidAt, paymentVersion: payment.paymentVersion, grossRecordedAmountMinor: payment.grossRecordedAmountMinor, voidedAmountMinor: payment.voidedAmountMinor, refundedAmountMinor: payment.refundedAmountMinor, netRetainedAmountMinor: payment.netRetainedAmountMinor,
    effectiveStatus: effectiveStatus(payment), voidAllowed: payment.paymentVersion === 1, refundAvailableMinor: payment.netRetainedAmountMinor, accountLink: link?.accountId ? { accountId: link.accountId, version: link.version } : null };
}

function effectiveStatus(payment: EffectivePaymentProjection): FinanceCorrectionPayment['effectiveStatus'] {
  if (payment.voidedAmountMinor > 0) return 'VOIDED';
  if (payment.refundedAmountMinor === 0) return 'RETAINED';
  return payment.netRetainedAmountMinor === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}

function canSetTerminal(booking: FinanceBookingServiceEvidence, service: ServicePricing | undefined): boolean {
  if (!['CANCELLED', 'NO_SHOW'].includes(booking.status) || booking.resourceIds.length !== 1 || !service || !Array.isArray(service.items) || service.items.length !== 1) return false;
  return service.currency === 'PYG' && service.items[0].resourceId === booking.resourceIds[0];
}

function jsonRows(payload: Prisma.JsonValue, key: string): Prisma.JsonObject[] {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) throw new FinanceConflictError('El conjunto de cierre Payment es inválido.');
  const rows = payload[key];
  if (!Array.isArray(rows) || rows.some((row) => row === null || typeof row !== 'object' || Array.isArray(row))) throw new FinanceConflictError('Una fuente de planes Payment es inválida.');
  return rows as Prisma.JsonObject[];
}

function jsonMoney(row: Prisma.JsonObject, key: string): bigint {
  const value = row[key];
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new FinanceConflictError('Una fuente de planes Payment tiene un importe inválido.');
  return BigInt(value);
}

function jsonString(row: Prisma.JsonObject, key: string): string {
  const value = row[key];
  if (typeof value !== 'string' || value.length === 0) throw new FinanceConflictError('Una fuente de planes Payment perdió su identificador.');
  return value;
}

function closingPlanStates(payload: Prisma.JsonValue): Map<string, PlanState> {
  const plans = jsonRows(payload, 'paymentPlans'); const installments = jsonRows(payload, 'installments'); const applications = jsonRows(payload, 'applications');
  return new Map(plans.map((plan) => {
    const id = jsonString(plan, 'id');
    const own = installments.filter((installment) => jsonString(installment, 'paymentPlanId') === id);
    const installmentIds = new Set(own.map((installment) => jsonString(installment, 'id')));
    return [jsonString(plan, 'bookingId'), { currency: jsonString(plan, 'currency'), totalAmountMinor: safeMoney(jsonMoney(plan, 'totalAmountMinor')), installmentTotalAmountMinor: safeMoney(own.reduce((sum, installment) => sum + jsonMoney(installment, 'amountMinor'), 0n)), appliedAmountMinor: safeMoney(applications.filter((application) => installmentIds.has(jsonString(application, 'installmentId'))).reduce((sum, application) => sum + jsonMoney(application, 'effectiveAmountMinor'), 0n)) }];
  }));
}
