import {
  type CreatePaymentPlanData,
  type PaymentPlan,
  type PaymentPlanRepository,
} from '../../../src/modules/payment/domain/payment-plan';
import {
  PaymentStatus,
  type Payment,
  type PaymentRepository,
  type RegisterPaymentData,
} from '../../../src/modules/payment/domain/payment';
import type { OutstandingBalanceRepository } from '../../../src/modules/payment/domain/outstanding-balance';
import { planApplicationRelease, PaymentAdjustmentConflictError } from '../../../src/modules/payment/domain/payment-adjustment.rules';
import { needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING } from '../../../src/modules/payment/domain/financial-reconciliation';

interface Application {
  paymentId: string;
  installmentId: string;
  amountMinor: number;
}

const payments: Payment[] = [];
const plans: PaymentPlan[] = [];
const applications: Application[] = [];
interface Adjustment { id: string; paymentId: string; kind: 'VOID' | 'REFUND'; amountMinor: number; occurredAt: Date; createdAt: Date; sequence: number; }
interface Reversal extends Application { adjustmentId: string; }
const adjustments: Adjustment[] = [];
const reversals: Reversal[] = [];

function effectiveApplication(application: Application): number {
  return application.amountMinor - reversals.filter((row) => row.paymentId === application.paymentId && row.installmentId === application.installmentId).reduce((sum, row) => sum + row.amountMinor, 0);
}

function effectivePayment(payment: Payment) {
  const own = adjustments.filter((row) => row.paymentId === payment.id);
  const voidedAmountMinor = own.filter((row) => row.kind === 'VOID').reduce((sum, row) => sum + row.amountMinor, 0);
  const refundedAmountMinor = own.filter((row) => row.kind === 'REFUND').reduce((sum, row) => sum + row.amountMinor, 0);
  return { grossRecordedAmountMinor: payment.amountMinor, voidedAmountMinor, refundedAmountMinor, netRetainedAmountMinor: payment.amountMinor - voidedAmountMinor - refundedAmountMinor, paymentVersion: 1 + own.length };
}

function bookingAmounts(businessId: string, bookingId: string) {
  const states = payments.filter((payment) => payment.businessId === businessId && payment.bookingId === bookingId).map(effectivePayment);
  const sum = (key: keyof ReturnType<typeof effectivePayment>) => Number(states.reduce((total, state) => total + BigInt(state[key]), 0n));
  const amounts = { grossRecordedAmountMinor: sum('grossRecordedAmountMinor'), voidedAmountMinor: sum('voidedAmountMinor'), refundedAmountMinor: sum('refundedAmountMinor'), netRetainedAmountMinor: sum('netRetainedAmountMinor'), financialVersion: sum('paymentVersion') };
  if (Object.values(amounts).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('PAYMENT_FAKE_FINANCIAL_INVARIANT');
  return amounts;
}

function currentPlan(plan: PaymentPlan): PaymentPlan {
  const amounts = bookingAmounts(plan.businessId, plan.bookingId);
  const installments = plan.installments.map((installment) => ({ ...installment, appliedAmountMinor: applications.filter((application) => application.installmentId === installment.id).reduce((sum, application) => sum + effectiveApplication(application), 0) }));
  const price = snapshots.get(plan.bookingId) ?? plan;
  const needsReconciliation = needsPaymentReconciliation(price, amounts.netRetainedAmountMinor, { currency: plan.currency, totalAmountMinor: plan.totalAmountMinor, installmentTotalAmountMinor: installments.reduce((sum, item) => sum + item.amountMinor, 0), appliedAmountMinor: installments.reduce((sum, item) => sum + item.appliedAmountMinor, 0) });
  return { ...plan, ...amounts, paidAmountMinor: amounts.netRetainedAmountMinor, installments, needsReconciliation, warning: needsReconciliation ? PAYMENT_RECONCILIATION_WARNING : null };
}

function compareInstallments(left: PaymentPlan['installments'][number], right: PaymentPlan['installments'][number]): number {
  const dueDate = compareNullableDates(left.dueDate, right.dueDate);
  if (dueDate !== 0) return dueDate;
  const sortOrder = left.sortOrder - right.sortOrder;
  if (sortOrder !== 0) return sortOrder;
  return left.id.localeCompare(right.id);
}

function compareNullableDates(left: Date | null, right: Date | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}

function apply(payment: Payment, plan: PaymentPlan): void {
  if (applications.some((item) => item.paymentId === payment.id)) return;
  let remaining = effectivePayment(payment).netRetainedAmountMinor;
  if (remaining === 0) return;
  const ordered = [...plan.installments].sort(compareInstallments);
  for (const installment of ordered) {
    const applied = applications
      .filter((item) => item.installmentId === installment.id)
      .reduce((sum, item) => sum + effectiveApplication(item), 0);
    const amountMinor = Math.min(remaining, installment.amountMinor - applied);
    if (amountMinor <= 0) continue;
    applications.push({ paymentId: payment.id, installmentId: installment.id, amountMinor });
    installment.appliedAmountMinor += amountMinor;
    remaining -= amountMinor;
    if (remaining === 0) return;
  }
  throw new Error('PAYMENT_APPLICATION_OVERFLOW');
}

function buildPlan(data: CreatePaymentPlanData, id: string, createdAt: Date): PaymentPlan {
  const amounts = bookingAmounts(data.businessId, data.bookingId);
  return {
    ...amounts,
    paidAmountMinor: amounts.netRetainedAmountMinor,
    id,
    businessId: data.businessId,
    bookingId: data.bookingId,
    currency: data.currency,
    totalAmountMinor: data.totalAmountMinor,
    createdByUserId: data.actorUserId,
    updatedByUserId: data.actorUserId,
    createdAt,
    updatedAt: createdAt,
    installments: data.installments.map((item, index) => ({
      id: `72000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      ...item,
      appliedAmountMinor: 0,
    })),
  };
}

export const paymentPlanRepositoryFake: PaymentPlanRepository = {
  create: (data) => {
    if (plans.some((item) => item.bookingId === data.bookingId)) return Promise.reject(new Error('PAYMENT_PLAN_EXISTS'));
    if (bookingAmounts(data.businessId, data.bookingId).netRetainedAmountMinor > data.totalAmountMinor) return Promise.reject(new Error('PAYMENT_PLAN_CREDIT_REQUIRES_RECONCILIATION'));
    const plan = buildPlan(data, `71000000-0000-4000-8000-${String(plans.length + 1).padStart(12, '0')}`, new Date());
    plans.push(plan);
    payments
      .filter((item) => item.businessId === data.businessId && item.bookingId === data.bookingId && item.status === PaymentStatus.RECORDED)
      .sort((left, right) => left.paidAt.getTime() - right.paidAt.getTime()
        || left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id))
      .forEach((payment) => apply(payment, plan));
    return Promise.resolve(currentPlan(plan));
  },
  findByBooking: ({ businessId, bookingId }) => {
    const plan = plans.find((item) => item.businessId === businessId && item.bookingId === bookingId);
    return Promise.resolve(plan ? currentPlan(plan) : null);
  },
  replace: (data) => {
    const index = plans.findIndex((item) => item.businessId === data.businessId && item.bookingId === data.bookingId);
    if (index < 0) return Promise.reject(new Error('PAYMENT_PLAN_NOT_FOUND'));
    const current = plans[index];
    if (current.installments.some((installment) => applications.some((item) => item.installmentId === installment.id))) {
      return Promise.reject(new Error('PAYMENT_PLAN_HAS_APPLICATIONS'));
    }
    if (bookingAmounts(data.businessId, data.bookingId).netRetainedAmountMinor > data.totalAmountMinor) return Promise.reject(new Error('PAYMENT_PLAN_CREDIT_REQUIRES_RECONCILIATION'));
    plans[index] = {
      ...buildPlan(data, current.id, current.createdAt),
      createdByUserId: current.createdByUserId,
      updatedAt: new Date(),
    };
    return Promise.resolve(currentPlan(plans[index]));
  },
};

export const paymentRepositoryFake: PaymentRepository = {
  register: (data: RegisterPaymentData, total: number) => {
    const previous = payments.find((item) => item.businessId === data.businessId && item.idempotencyKey === data.idempotencyKey);
    if (previous) {
      if (previous.requestFingerprint !== data.requestFingerprint) return Promise.reject(new Error('IDEMPOTENCY_CONFLICT'));
      return Promise.resolve({ payment: previous, duplicate: true });
    }
    const paid = bookingAmounts(data.businessId, data.bookingId).netRetainedAmountMinor;
    if (paid + data.amountMinor > total) return Promise.reject(new Error('OVERPAYMENT'));
    const payment: Payment = {
      id: `70000000-0000-4000-8000-${String(payments.length + 1).padStart(12, '0')}`,
      ...data,
      createdAt: new Date(),
    };
    payments.push(payment);
    const plan = plans.find((item) => item.businessId === data.businessId && item.bookingId === data.bookingId);
    if (plan) apply(payment, plan);
    return Promise.resolve({ payment, duplicate: false });
  },
  listByBooking: ({ businessId, bookingId, before, limit }) => Promise.resolve(
    payments
      .filter((item) => item.businessId === businessId && item.bookingId === bookingId)
      .sort(comparePaymentsDescending)
      .filter((item) => !before || comparePaymentToCursor(item, before) > 0)
      .slice(0, limit)
      .map(toPublicPayment),
  ),
};

function comparePaymentsDescending(left: Payment, right: Payment): number {
  return right.paidAt.getTime() - left.paidAt.getTime()
    || right.createdAt.getTime() - left.createdAt.getTime()
    || right.id.localeCompare(left.id);
}

function comparePaymentToCursor(payment: Payment, cursor: { paidAt:Date; createdAt:Date; id:string }): number {
  return cursor.paidAt.getTime() - payment.paidAt.getTime()
    || cursor.createdAt.getTime() - payment.createdAt.getTime()
    || cursor.id.localeCompare(payment.id);
}

function toPublicPayment(payment: Payment): import('../../../src/modules/payment/domain/payment').EffectivePaymentHistoryItem {
  const state = effectivePayment(payment);
  const effectiveStatus = state.voidedAmountMinor > 0 ? 'VOIDED' : state.refundedAmountMinor === 0 ? 'RETAINED' : state.netRetainedAmountMinor === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  return {
    id: payment.id,
    bookingId: payment.bookingId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
    note: payment.note,
    paidAt: payment.paidAt,
    createdAt: payment.createdAt,
    recordedByUserId: payment.recordedByUserId,
    status: payment.status,
    ...state,
    effectiveStatus,
    adjustments: adjustments.filter((row) => row.paymentId === payment.id).map(({ id, kind, amountMinor, occurredAt, createdAt, sequence }) => ({ id, kind, amountMinor, occurredAt, createdAt, sequence })),
  };
}

export const outstandingBalanceRepositoryFake: OutstandingBalanceRepository = {
  calculate: ({ businessId, bookingId, businessLocalDate }) => {
    const amounts = bookingAmounts(businessId, bookingId);
    const paidAmountMinor = amounts.netRetainedAmountMinor;
    const plan = plans.find((item) => item.businessId === businessId && item.bookingId === bookingId);
    if (!plan) return Promise.resolve({ ...amounts, paymentPlanId: null, paidAmountMinor, planTotalAmountMinor: null, installmentTotalAmountMinor: 0, appliedAmountMinor: 0, overdueAmountMinor: 0, nextDueDate: null, nextDueAmountMinor: null });
    const balances = plan.installments.map((installment) => {
      const appliedAmountMinor = applications.filter((item) => item.installmentId === installment.id).reduce((sum, item) => sum + effectiveApplication(item), 0);
      return { ...installment, appliedAmountMinor, outstandingAmountMinor: installment.amountMinor - appliedAmountMinor };
    });
    const overdueAmountMinor = balances.filter((item) => item.outstandingAmountMinor > 0 && item.dueDate !== null && item.dueDate.toISOString().slice(0, 10) < businessLocalDate).reduce((sum, item) => sum + item.outstandingAmountMinor, 0);
    const nextDue = balances.filter((item) => item.outstandingAmountMinor > 0 && item.dueDate !== null).sort(compareInstallments)[0] ?? null;
    return Promise.resolve({ ...amounts, paymentPlanId: plan.id, paidAmountMinor, planTotalAmountMinor: plan.totalAmountMinor, installmentTotalAmountMinor: balances.reduce((sum, item) => sum + item.amountMinor, 0), appliedAmountMinor: balances.reduce((sum, item) => sum + item.appliedAmountMinor, 0), overdueAmountMinor, nextDueDate: nextDue?.dueDate ?? null, nextDueAmountMinor: nextDue?.outstandingAmountMinor ?? null });
  },
};

export const snapshots = new Map<string, { id: string; businessId: string; bookingId: string; currency: string; totalAmountMinor: number; items: []; createdAt: Date }>();
export const pricingSnapshotRepositoryFake = { create: () => Promise.reject(new Error('No corresponde crear snapshots desde Payment.')), findByBookingId: (bookingId: string) => Promise.resolve(snapshots.get(bookingId) ?? null) };
export function resetPaymentFakes(): void { payments.length = 0; plans.length = 0; applications.length = 0; adjustments.length = 0; reversals.length = 0; snapshots.clear(); }
export function paymentCount(): number { return payments.length; }
export function applicationCount(): number { return applications.length; }
export function addPaymentFake(payment: Payment): void { payments.push(payment); }

export function appendPaymentAdjustmentFake(input: { businessId: string; paymentId: string; kind: 'VOID' | 'REFUND'; amountMinor?: number }): void {
  const payment = payments.find((row) => row.id === input.paymentId && row.businessId === input.businessId);
  if (!payment) throw new Error('PAYMENT_FAKE_NOT_FOUND');
  const state = effectivePayment(payment);
  if (state.voidedAmountMinor > 0 || (input.kind === 'VOID' && state.paymentVersion !== 1)) throw new PaymentAdjustmentConflictError('El cobro no admite este ajuste.');
  const amountMinor = input.kind === 'VOID' ? state.grossRecordedAmountMinor : input.amountMinor;
  if (amountMinor === undefined) throw new Error('PAYMENT_FAKE_AMOUNT_REQUIRED');
  const ownApplications = applications.filter((row) => row.paymentId === payment.id).map((application) => {
    const installment = plans.flatMap((plan) => plan.installments).find((row) => row.id === application.installmentId);
    if (!installment) throw new Error('PAYMENT_FAKE_APPLICATION_INVARIANT');
    return { installmentId: installment.id, dueDate: installment.dueDate?.toISOString().slice(0, 10) ?? null, sortOrder: installment.sortOrder, effectiveAmountMinor: effectiveApplication(application) };
  });
  const releases = planApplicationRelease(state.netRetainedAmountMinor, amountMinor, ownApplications);
  const id = `74000000-0000-4000-8000-${String(adjustments.length + 1).padStart(12, '0')}`;
  adjustments.push({ id, paymentId: payment.id, kind: input.kind, amountMinor, occurredAt: input.kind === 'VOID' ? payment.paidAt : new Date(), createdAt: new Date(), sequence: state.paymentVersion });
  reversals.push(...releases.map((release) => ({ paymentId: payment.id, installmentId: release.installmentId, amountMinor: release.amountMinor, adjustmentId: id })));
}

export function reversalCount(): number { return reversals.length; }
