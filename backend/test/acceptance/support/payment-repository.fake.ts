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

interface Application {
  paymentId: string;
  installmentId: string;
  amountMinor: number;
}

const payments: Payment[] = [];
const plans: PaymentPlan[] = [];
const applications: Application[] = [];

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
  let remaining = payment.amountMinor;
  const ordered = [...plan.installments].sort(compareInstallments);
  for (const installment of ordered) {
    const applied = applications
      .filter((item) => item.installmentId === installment.id)
      .reduce((sum, item) => sum + item.amountMinor, 0);
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
  return {
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
    const plan = buildPlan(data, `71000000-0000-4000-8000-${String(plans.length + 1).padStart(12, '0')}`, new Date());
    plans.push(plan);
    payments
      .filter((item) => item.businessId === data.businessId && item.bookingId === data.bookingId && item.status === PaymentStatus.RECORDED)
      .sort((left, right) => left.paidAt.getTime() - right.paidAt.getTime()
        || left.createdAt.getTime() - right.createdAt.getTime()
        || left.id.localeCompare(right.id))
      .forEach((payment) => apply(payment, plan));
    return Promise.resolve(plan);
  },
  findByBooking: ({ businessId, bookingId }) => Promise.resolve(
    plans.find((item) => item.businessId === businessId && item.bookingId === bookingId) ?? null,
  ),
  replace: (data) => {
    const index = plans.findIndex((item) => item.businessId === data.businessId && item.bookingId === data.bookingId);
    if (index < 0) return Promise.reject(new Error('PAYMENT_PLAN_NOT_FOUND'));
    const current = plans[index];
    if (current.installments.some((installment) => applications.some((item) => item.installmentId === installment.id))) {
      return Promise.reject(new Error('PAYMENT_PLAN_HAS_APPLICATIONS'));
    }
    plans[index] = {
      ...buildPlan(data, current.id, current.createdAt),
      createdByUserId: current.createdByUserId,
      updatedAt: new Date(),
    };
    return Promise.resolve(plans[index]);
  },
};

export const paymentRepositoryFake: PaymentRepository = {
  register: (data: RegisterPaymentData, total: number) => {
    const previous = payments.find((item) => item.businessId === data.businessId && item.idempotencyKey === data.idempotencyKey);
    if (previous) {
      if (previous.requestFingerprint !== data.requestFingerprint) return Promise.reject(new Error('IDEMPOTENCY_CONFLICT'));
      return Promise.resolve({ payment: previous, duplicate: true });
    }
    const paid = payments
      .filter((item) => item.businessId === data.businessId && item.bookingId === data.bookingId && item.status === PaymentStatus.RECORDED)
      .reduce((sum, item) => sum + item.amountMinor, 0);
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
};

export const snapshots = new Map<string, { id: string; businessId: string; bookingId: string; currency: string; totalAmountMinor: number; items: []; createdAt: Date }>();
export const pricingSnapshotRepositoryFake = { create: () => Promise.reject(new Error('No corresponde crear snapshots desde Payment.')), findByBookingId: (bookingId: string) => Promise.resolve(snapshots.get(bookingId) ?? null) };
export function resetPaymentFakes(): void { payments.length = 0; plans.length = 0; applications.length = 0; snapshots.clear(); }
export function paymentCount(): number { return payments.length; }
export function applicationCount(): number { return applications.length; }
