import { Prisma } from '@prisma/client';
import { AuthorizationPolicy } from '../../../shared/application/authorization-policy';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { appendBookingTimelineEvent } from '../../booking/booking.contract';
import type { MembershipRole } from '../../identity/identity.contract';
import { readCurrentPricing } from '../../pricing/pricing.contract';
import { PaymentAdjustmentConflictError, PaymentAdjustmentForbiddenError, PaymentAdjustmentInvariantError, PaymentAdjustmentNotFoundError, planApplicationRelease, validatePaymentAdjustmentReason, validatePaymentAdjustmentReference, validateRefundAmount, validateRefundOccurredAt } from '../domain/payment-adjustment.rules';
import type { PaymentAdjustmentInput, PaymentAdjustmentResult, RefundAccountScope } from '../domain/payment-adjustment.types';
import { readEffectiveApplications, readEffectivePayments, summarizeEffectivePayments, type EffectivePaymentProjection } from './prisma-payment-effective.reader';

interface LockedScope {
  bookingUpdatedAt: Date;
  currentPricingId: string;
  financialVersion: number;
  payment: EffectivePaymentProjection;
  paidAt: Date;
}

export type ResolveRefundAccount = (transaction: Prisma.TransactionClient, input: { businessId: string; accountId: string; expectedAccountVersion: number; occurredAt: Date }) => Promise<RefundAccountScope>;

/** The caller owns the transaction and FinanceRequest. This writer owns Payment facts. */
export async function appendPaymentAdjustment(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput, resolveRefundAccount?: ResolveRefundAccount): Promise<PaymentAdjustmentResult> {
  const reason = validatePaymentAdjustmentReason(input.reason);
  await authorizeActor(transaction, input);
  const scope = await lockAdjustmentScope(transaction, input);
  requireExpectation(input, scope);
  await transaction.$queryRaw`SELECT application."paymentId", application."installmentId" FROM "PaymentApplication" application WHERE application."paymentId" = ${input.paymentId} ORDER BY application."installmentId" FOR UPDATE`;
  const applications = await readEffectiveApplications(transaction, input.businessId, input.bookingId, input.paymentId);
  const adjustment = await prepareAdjustment(transaction, input, scope, resolveRefundAccount);
  await requireOpenAdjustmentPeriod(transaction, input, adjustment.occurredAt);
  const reversals = planApplicationRelease(scope.payment.netRetainedAmountMinor, adjustment.amountMinor, applications.map((row) => ({ installmentId: row.installmentId, effectiveAmountMinor: row.effectiveAmountMinor, dueDate: row.dueDate?.toISOString().slice(0, 10) ?? null, sortOrder: row.sortOrder })));
  const after = projectedAfterState(input, scope, adjustment.amountMinor);
  const row = await transaction.paymentAdjustment.create({ data: {
    businessId: input.businessId, bookingId: input.bookingId, paymentId: input.paymentId, kind: input.kind,
    amountMinor: toPrismaMoney(adjustment.amountMinor), currency: 'PYG', occurredAt: adjustment.occurredAt,
    recordedByUserId: input.actorUserId, reason, reference: adjustment.reference, accountId: adjustment.accountId,
    sequence: scope.payment.paymentVersion, requestId: input.requestId,
    beforeStateJson: stateJson(scope), afterStateJson: after,
  }, select: { id: true } });
  if (reversals.length > 0) await transaction.paymentApplicationReversal.createMany({ data: reversals.map((release) => ({ businessId: input.businessId, paymentId: input.paymentId, installmentId: release.installmentId, adjustmentId: row.id, amountMinor: toPrismaMoney(release.amountMinor) })) });
  await verifyAfterState(transaction, input, after);
  await appendBookingTimelineEvent(transaction, { businessId: input.businessId, bookingId: input.bookingId, actorUserId: input.actorUserId, type: input.kind === 'VOID' ? 'PAYMENT_VOID_RECORDED' : 'PAYMENT_REFUND_RECORDED', details: { adjustmentId: row.id, paymentId: input.paymentId } });
  return { id: row.id, type: input.kind === 'VOID' ? 'VOID_PAYMENT' : 'REFUND_PAYMENT', version: after.paymentVersion, bookingId: input.bookingId, paymentId: input.paymentId, currentPricingId: scope.currentPricingId, paymentVersion: after.paymentVersion, financialVersion: after.financialVersion, amounts: after.amounts, applicationReversals: reversals };
}

async function requireOpenAdjustmentPeriod(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput, occurredAt: Date): Promise<void> {
  const dates = await transaction.$queryRaw<{ date: string }[]>`SELECT to_char(${occurredAt}::timestamptz AT TIME ZONE timezone, 'YYYY-MM-DD') AS date FROM "Business" WHERE id=${input.businessId}`;
  if (!dates[0]) throw new PaymentAdjustmentInvariantError('No se puede determinar la fecha local del ajuste.');
  await assertFinancePeriodOpen(transaction, input.businessId, [dates[0].date], input.kind === 'VOID' ? [{ type: 'PAYMENT', id: input.paymentId }] : []);
}

async function authorizeActor(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput): Promise<void> {
  const users = await transaction.$queryRaw<{ status: string }[]>`SELECT status FROM "User" WHERE id=${input.actorUserId} FOR SHARE`;
  const memberships = await transaction.$queryRaw<{ role: string }[]>`SELECT role FROM "UserBusinessMembership" WHERE "userId"=${input.actorUserId} AND "businessId"=${input.businessId} FOR SHARE`;
  const capability = input.kind === 'VOID' ? 'payment.void' : 'payment.refund';
  if (users[0]?.status !== 'ACTIVE' || !memberships[0] || !new AuthorizationPolicy().isAllowed(memberships[0].role as MembershipRole, capability)) throw new PaymentAdjustmentForbiddenError('El actor no puede ajustar cobros en este negocio.');
}

async function lockAdjustmentScope(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput): Promise<LockedScope> {
  const bookings = await transaction.$queryRaw<{ updatedAt: Date }[]>`SELECT "updatedAt" FROM "Booking" WHERE id=${input.bookingId} AND "businessId"=${input.businessId} FOR UPDATE`;
  if (!bookings[0]) throw new PaymentAdjustmentNotFoundError('La reserva no está disponible.');
  const businesses = await transaction.$queryRaw<{ status: string; currency: string }[]>`SELECT status,currency FROM "Business" WHERE id=${input.businessId} FOR SHARE`;
  if (!businesses[0]) throw new PaymentAdjustmentNotFoundError('El negocio no está disponible.');
  if (businesses[0].status !== 'ACTIVE' || businesses[0].currency !== 'PYG') throw new PaymentAdjustmentConflictError('El negocio debe estar activo y operar en PYG.');
  await transaction.$queryRaw`SELECT id FROM "PricingSnapshot" WHERE "bookingId"=${input.bookingId} AND "businessId"=${input.businessId} FOR UPDATE`;
  const price = await readCurrentPricing(transaction, input.businessId, input.bookingId);
  if (!price || price.currency !== 'PYG') throw new PaymentAdjustmentConflictError('La reserva requiere un precio acordado en PYG.');
  const originals = await transaction.$queryRaw<{ paidAt: Date }[]>`SELECT "paidAt" FROM "Payment" WHERE id=${input.paymentId} AND "businessId"=${input.businessId} AND "bookingId"=${input.bookingId} AND status='RECORDED' FOR UPDATE`;
  if (!originals[0]) throw new PaymentAdjustmentNotFoundError('El cobro original no está disponible.');
  const payments = await readEffectivePayments(transaction, input.businessId, [input.bookingId]);
  const payment = payments.find((row) => row.paymentId === input.paymentId);
  if (!payment) throw new PaymentAdjustmentInvariantError('El cobro no tiene una proyección efectiva.');
  const amounts = summarizeEffectivePayments(payments, price.currency);
  return { bookingUpdatedAt: bookings[0].updatedAt, currentPricingId: price.id, financialVersion: amounts.financialVersion, payment, paidAt: originals[0].paidAt };
}

function requireExpectation(input: PaymentAdjustmentInput, scope: LockedScope): void {
  if (input.expectedBookingUpdatedAt !== scope.bookingUpdatedAt.toISOString() || input.currentPricingId !== scope.currentPricingId || input.expectedPaymentVersion !== scope.payment.paymentVersion || input.expectedFinancialVersion !== scope.financialVersion) {
    throw new PaymentAdjustmentConflictError('La reserva, el precio o los cobros cambiaron; actualice la información antes de confirmar.');
  }
}

async function prepareAdjustment(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput, scope: LockedScope, resolveRefundAccount?: ResolveRefundAccount): Promise<{ amountMinor: number; occurredAt: Date; reference: string | null; accountId: string | null }> {
  if (input.kind === 'VOID') {
    requireVoidAllowed(scope.payment);
    return { amountMinor: scope.payment.grossRecordedAmountMinor, occurredAt: scope.paidAt, reference: null, accountId: null };
  }
  if (scope.payment.voidedAmountMinor !== 0) throw new PaymentAdjustmentConflictError('Un cobro anulado no admite devoluciones.');
  const amountMinor = validateRefundAmount(input.amountMinor);
  if (amountMinor > scope.payment.netRetainedAmountMinor) throw new PaymentAdjustmentConflictError('La devolución excede el neto disponible del cobro original.');
  const occurredAt = validateRefundOccurredAt(input.occurredAt, scope.paidAt, new Date());
  const reference = validatePaymentAdjustmentReference(input.reference);
  if (!resolveRefundAccount) throw new PaymentAdjustmentInvariantError('Falta el validador de cuenta de la devolución.');
  const account = await resolveRefundAccount(transaction, { businessId: input.businessId, accountId: input.accountId, expectedAccountVersion: input.expectedAccountVersion, occurredAt });
  requireRefundAccount(account, input.accountId, input.expectedAccountVersion, occurredAt);
  return { amountMinor, occurredAt, reference, accountId: account.accountId };
}

function requireVoidAllowed(payment: EffectivePaymentProjection): void {
  if (payment.paymentVersion !== 1 || payment.voidedAmountMinor !== 0 || payment.refundedAmountMinor !== 0) throw new PaymentAdjustmentConflictError('Un cobro ya ajustado no puede anularse.');
}

function requireRefundAccount(account: RefundAccountScope, accountId: string, version: number, occurredAt: Date): void {
  if (account.accountId !== accountId || account.accountVersion !== version || !account.openingId) throw new PaymentAdjustmentConflictError('La cuenta o su versión no admite esta devolución.');
  if (!(account.openingOccurredAt instanceof Date) || !Number.isFinite(account.openingOccurredAt.getTime())) throw new PaymentAdjustmentConflictError('La apertura de la cuenta no es válida.');
  if (occurredAt < account.openingOccurredAt) throw new PaymentAdjustmentConflictError('La devolución es anterior al corte de apertura.');
}

function stateJson(scope: LockedScope): Prisma.InputJsonObject {
  return { bookingUpdatedAt: scope.bookingUpdatedAt.toISOString(), currentPricingId: scope.currentPricingId, financialVersion: scope.financialVersion, paymentVersion: scope.payment.paymentVersion, amounts: { grossRecordedAmountMinor: scope.payment.grossRecordedAmountMinor, voidedAmountMinor: scope.payment.voidedAmountMinor, refundedAmountMinor: scope.payment.refundedAmountMinor, netRetainedAmountMinor: scope.payment.netRetainedAmountMinor } };
}

function projectedAfterState(input: PaymentAdjustmentInput, scope: LockedScope, amountMinor: number) {
  const paymentVersion = fromPrismaMoney(BigInt(scope.payment.paymentVersion) + 1n);
  const financialVersion = fromPrismaMoney(BigInt(scope.financialVersion) + 1n);
  return { currentPricingId: scope.currentPricingId, paymentVersion, financialVersion, amounts: { grossRecordedAmountMinor: scope.payment.grossRecordedAmountMinor, voidedAmountMinor: scope.payment.voidedAmountMinor + (input.kind === 'VOID' ? amountMinor : 0), refundedAmountMinor: scope.payment.refundedAmountMinor + (input.kind === 'REFUND' ? amountMinor : 0), netRetainedAmountMinor: scope.payment.netRetainedAmountMinor - amountMinor } };
}

async function verifyAfterState(transaction: Prisma.TransactionClient, input: PaymentAdjustmentInput, expected: ReturnType<typeof projectedAfterState>): Promise<ReturnType<typeof projectedAfterState>> {
  const payments = await readEffectivePayments(transaction, input.businessId, [input.bookingId]);
  const payment = payments.find((row) => row.paymentId === input.paymentId);
  const booking = summarizeEffectivePayments(payments, 'PYG');
  if (!payment || payment.paymentVersion !== expected.paymentVersion || booking.financialVersion !== expected.financialVersion || payment.netRetainedAmountMinor !== expected.amounts.netRetainedAmountMinor || payment.voidedAmountMinor !== expected.amounts.voidedAmountMinor || payment.refundedAmountMinor !== expected.amounts.refundedAmountMinor) throw new PaymentAdjustmentInvariantError('El ajuste no conserva el resultado efectivo esperado.');
  return expected;
}
