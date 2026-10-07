import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { fromPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { PaymentAdjustmentInvariantError } from '../domain/payment-adjustment.rules';
import { readEffectivePayments } from './prisma-payment-effective.reader';

export interface PaymentClosingSourceRef { type: string; id: string; version: string }
export interface PaymentClosingSources { payload: Prisma.JsonValue; sourceRefs: PaymentClosingSourceRef[]; sourceToken: string; complete: boolean }

/** The authorized Finance caller owns one repeatable-read cut and the closing snapshot. */
export async function readPaymentClosingSources(transaction: Prisma.TransactionClient, businessId: string, asOf: Date): Promise<PaymentClosingSources> {
  if (!businessId || !Number.isFinite(asOf.getTime())) throw new PaymentAdjustmentInvariantError('El corte de fuentes Payment no es válido.');
  const [payments, plans, installments, applications, adjustments, reversals] = await Promise.all([
    transaction.payment.findMany({ where: { businessId, createdAt: { lte: asOf } }, orderBy: { id: 'asc' }, take: 5001, select: { id: true, businessId: true, bookingId: true, amountMinor: true, currency: true, method: true, status: true, paidAt: true, createdAt: true } }),
    transaction.paymentPlan.findMany({ where: { businessId, createdAt: { lte: asOf } }, orderBy: { id: 'asc' }, take: 5001, select: { id: true, businessId: true, bookingId: true, currency: true, totalAmountMinor: true, createdAt: true, updatedAt: true } }),
    transaction.paymentPlanInstallment.findMany({ where: { paymentPlan: { businessId, createdAt: { lte: asOf } } }, orderBy: { id: 'asc' }, take: 5001, select: { id: true, paymentPlanId: true, amountMinor: true, dueDate: true, sortOrder: true } }),
    transaction.paymentApplication.findMany({ where: { payment: { businessId }, createdAt: { lte: asOf } }, orderBy: [{ paymentId: 'asc' }, { installmentId: 'asc' }], take: 5001, select: { paymentId: true, installmentId: true, amountMinor: true, createdAt: true } }),
    transaction.paymentAdjustment.findMany({ where: { businessId, createdAt: { lte: asOf } }, orderBy: [{ paymentId: 'asc' }, { sequence: 'asc' }], take: 5001, select: { id: true, businessId: true, bookingId: true, paymentId: true, kind: true, amountMinor: true, currency: true, occurredAt: true, createdAt: true, sequence: true } }),
    transaction.paymentApplicationReversal.findMany({ where: { businessId, createdAt: { lte: asOf } }, orderBy: { id: 'asc' }, take: 5001, select: { id: true, businessId: true, paymentId: true, installmentId: true, adjustmentId: true, amountMinor: true, createdAt: true } }),
  ]);
  for (const rows of [payments, plans, installments, applications, adjustments, reversals]) requireWithinLimit(rows.length);
  await readEffectivePayments(transaction, businessId, [...new Set(payments.map((payment) => payment.bookingId))]);
  const paymentRows = payments.map((payment) => closingPayment(payment, adjustments));
  const planRows = plans.map((plan) => ({ ...plan, totalAmountMinor: closingMoney(plan.totalAmountMinor, plan.currency), createdAt: plan.createdAt.toISOString(), updatedAt: plan.updatedAt.toISOString() }));
  const installmentRows = installments.map((installment) => ({ ...installment, amountMinor: closingMoney(installment.amountMinor, 'PYG'), dueDate: installment.dueDate?.toISOString().slice(0, 10) ?? null }));
  const adjustmentRows = adjustments.map((adjustment) => ({ ...adjustment, amountMinor: closingMoney(adjustment.amountMinor, adjustment.currency, true), occurredAt: adjustment.occurredAt.toISOString(), createdAt: adjustment.createdAt.toISOString() }));
  const reversalRows = reversals.map((reversal) => ({ ...reversal, amountMinor: closingMoney(reversal.amountMinor, 'PYG', true), createdAt: reversal.createdAt.toISOString() }));
  const applicationRows = applications.map((application) => {
    const released = reversals.filter((reversal) => reversal.paymentId === application.paymentId && reversal.installmentId === application.installmentId).reduce((sum, reversal) => sum + reversal.amountMinor, 0n);
    if (released > application.amountMinor) throw new PaymentAdjustmentInvariantError('Las reversas del corte exceden la aplicación original.');
    return { ...application, amountMinor: closingMoney(application.amountMinor, 'PYG', true), reversedAmountMinor: closingMoney(released, 'PYG'), effectiveAmountMinor: closingMoney(application.amountMinor - released, 'PYG'), createdAt: application.createdAt.toISOString() };
  });
  requireClosingScope({ payments: paymentRows, plans: planRows, installments: installmentRows, applications: applicationRows, adjustments: adjustmentRows, reversals: reversalRows });
  const payload = { payments: paymentRows, paymentPlans: planRows, installments: installmentRows, applications: applicationRows, adjustments: adjustmentRows, applicationReversals: reversalRows };
  const sourceRefs: PaymentClosingSourceRef[] = [
    ...paymentRows.map((row) => ({ type: 'PAYMENT', id: row.id, version: String(row.paymentVersion) })),
    ...planRows.map((row) => ({ type: 'PAYMENT_PLAN', id: row.id, version: hashValue(row) })),
    ...installmentRows.map((row) => ({ type: 'PAYMENT_INSTALLMENT', id: row.id, version: hashValue(row) })),
    ...applicationRows.map((row) => ({ type: 'PAYMENT_APPLICATION', id: `${row.paymentId}:${row.installmentId}`, version: '1' })),
    ...adjustmentRows.map((row) => ({ type: 'PAYMENT_ADJUSTMENT', id: row.id, version: String(row.sequence) })),
    ...reversalRows.map((row) => ({ type: 'PAYMENT_APPLICATION_REVERSAL', id: row.id, version: '1' })),
  ];
  // Installments have no creation timestamp, and plans are mutable heads without history.
  // An earlier cut cannot reconstruct a plan changed after that cut.
  const complete = plans.every((plan) => plan.updatedAt <= asOf);
  return { payload, sourceRefs, sourceToken: hashValue({ payload, complete }), complete };
}

function requireWithinLimit(count: number): void {
  if (count > 5000) throw new PaymentAdjustmentInvariantError('El cierre admite hasta 5000 registros por fuente Payment; no se trunca el historial.');
}

function closingMoney(value: bigint, currency: string, positive = false): number {
  if (currency !== 'PYG' || value < 0n || (positive && value === 0n)) throw new PaymentAdjustmentInvariantError('El cierre requiere importes Payment válidos en PYG.');
  return fromPrismaMoney(value);
}

function closingPayment(payment: { id: string; businessId: string; bookingId: string; amountMinor: bigint; currency: string; method: string; status: string; paidAt: Date; createdAt: Date }, adjustments: { paymentId: string; kind: string; amountMinor: bigint; sequence: number }[]) {
  const own = adjustments.filter((adjustment) => adjustment.paymentId === payment.id);
  const voided = own.filter((adjustment) => adjustment.kind === 'VOID').reduce((sum, adjustment) => sum + adjustment.amountMinor, 0n);
  const refunded = own.filter((adjustment) => adjustment.kind === 'REFUND').reduce((sum, adjustment) => sum + adjustment.amountMinor, 0n);
  if (own.some((adjustment, index) => adjustment.sequence !== index + 1 || !['VOID', 'REFUND'].includes(adjustment.kind))) throw new PaymentAdjustmentInvariantError('El corte de ajustes no conserva su secuencia.');
  return { ...payment, amountMinor: closingMoney(payment.amountMinor, payment.currency, true), grossRecordedAmountMinor: closingMoney(payment.amountMinor, payment.currency, true), voidedAmountMinor: closingMoney(voided, payment.currency), refundedAmountMinor: closingMoney(refunded, payment.currency), netRetainedAmountMinor: closingMoney(payment.amountMinor - voided - refunded, payment.currency), paymentVersion: own.length + 1, paidAt: payment.paidAt.toISOString(), createdAt: payment.createdAt.toISOString() };
}

interface ClosingScopedSources { payments: { id: string; bookingId: string; netRetainedAmountMinor: number }[]; plans: { id: string; bookingId: string; totalAmountMinor: number }[]; installments: { id: string; paymentPlanId: string; amountMinor: number }[]; applications: { paymentId: string; installmentId: string; effectiveAmountMinor: number }[]; adjustments: { id: string; paymentId: string; bookingId: string }[]; reversals: { paymentId: string; installmentId: string; adjustmentId: string }[] }

function requireClosingScope(sources: ClosingScopedSources): void {
  const payments = new Map(sources.payments.map((row) => [row.id, row]));
  const plans = new Map(sources.plans.map((row) => [row.id, row]));
  const installments = new Map(sources.installments.map((row) => [row.id, row]));
  const adjustments = new Map(sources.adjustments.map((row) => [row.id, row]));
  for (const row of sources.adjustments) if (payments.get(row.paymentId)?.bookingId !== row.bookingId) throw new PaymentAdjustmentInvariantError('El ajuste del corte no pertenece al cobro original.');
  requireClosingReversalScope(sources, adjustments);
  for (const row of sources.applications) requireClosingApplicationScope(row, payments, installments, plans);
  requireClosingTotals(sources, plans);
}

function requireClosingReversalScope(sources: ClosingScopedSources, adjustments: Map<string, { paymentId: string }>): void {
  const applications = new Set(sources.applications.map((row) => `${row.paymentId}:${row.installmentId}`));
  for (const row of sources.reversals) if (!applications.has(`${row.paymentId}:${row.installmentId}`) || adjustments.get(row.adjustmentId)?.paymentId !== row.paymentId) throw new PaymentAdjustmentInvariantError('La reversa del corte perdió su fuente original.');
}

function requireClosingTotals(sources: ClosingScopedSources, plans: Map<string, { totalAmountMinor: number }>): void {
  for (const payment of sources.payments) {
    const applied = sources.applications.filter((row) => row.paymentId === payment.id).reduce((sum, row) => sum + BigInt(row.effectiveAmountMinor), 0n);
    if (applied > BigInt(payment.netRetainedAmountMinor)) throw new PaymentAdjustmentInvariantError('Las aplicaciones del corte exceden el neto original.');
  }
  for (const installment of sources.installments) {
    const applied = sources.applications.filter((row) => row.installmentId === installment.id).reduce((sum, row) => sum + BigInt(row.effectiveAmountMinor), 0n);
    if (!plans.has(installment.paymentPlanId) || applied > BigInt(installment.amountMinor)) throw new PaymentAdjustmentInvariantError('La cuota del corte perdió su plan o excede su importe.');
  }
  for (const plan of sources.plans) {
    const total = sources.installments.filter((row) => row.paymentPlanId === plan.id).reduce((sum, row) => sum + BigInt(row.amountMinor), 0n);
    if (total !== BigInt(plan.totalAmountMinor)) throw new PaymentAdjustmentInvariantError('Las cuotas del corte no conservan el total del plan.');
  }
}

function requireClosingApplicationScope(application: { paymentId: string; installmentId: string }, payments: Map<string, { bookingId: string }>, installments: Map<string, { paymentPlanId: string }>, plans: Map<string, { bookingId: string }>): void {
  const payment = payments.get(application.paymentId);
  const installment = installments.get(application.installmentId);
  const plan = installment ? plans.get(installment.paymentPlanId) : null;
  if (!payment || !plan || payment.bookingId !== plan.bookingId) throw new PaymentAdjustmentInvariantError('La aplicación del corte no conserva el mismo negocio y reserva.');
}

function hashValue(value: Prisma.JsonValue): string {
  return createHash('sha256').update(JSON.stringify(canonicalValue(value))).digest('hex');
}

function canonicalValue(value: Prisma.JsonValue): Prisma.JsonValue {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key] ?? null)]));
  return value;
}
