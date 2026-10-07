import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BookingStatus } from '../../booking/booking.contract';
import { PrismaService } from '../../business/business.contract';
import type { CreatePaymentPlanData, PaymentPlan, PaymentPlanRepository } from '../domain/payment-plan';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { readCurrentPricing, type CurrentPricing } from '../../pricing/pricing.contract';
import { needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING } from '../domain/financial-reconciliation';
import { readBookingEffectiveAmounts, readEffectiveApplications, readEffectivePayments, summarizeEffectivePayments, type EffectiveApplicationProjection } from './prisma-payment-effective.reader';

interface InstallmentRow {
  id: string;
  amountMinor: bigint;
  dueDate: Date | null;
  sortOrder: number;
}

interface PlanRow {
  id: string;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: bigint;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  installments: InstallmentRow[];
}

@Injectable()
export class PrismaPaymentPlanRepository implements PaymentPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentPricing(businessId: string, bookingId: string): Promise<CurrentPricing | null> {
    return this.prisma.$transaction((transaction) => readCurrentPricing(transaction, businessId, bookingId), { isolationLevel: 'RepeatableRead' });
  }

  async create(data: CreatePaymentPlanData): Promise<PaymentPlan> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockWritableBooking(transaction, data.businessId, data.bookingId);
      const price = await this.requireCurrentPrice(transaction, data);
      const existing = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true } });
      if (existing) throw new Error('PAYMENT_PLAN_EXISTS');
      await this.requireNoCredit(transaction, data, price);
      await this.requireOpenPlanPeriod(transaction, data.businessId);
      const plan = await transaction.paymentPlan.create({ data: { businessId: data.businessId, bookingId: data.bookingId, currency: price.currency, totalAmountMinor: toPrismaMoney(price.totalAmountMinor), createdByUserId: data.actorUserId, updatedByUserId: data.actorUserId, installments: { create: data.installments.map((installment) => ({ ...installment, amountMinor: toPrismaMoney(installment.amountMinor) })) } }, select: { id: true } });
      const [payments, effective] = await Promise.all([
        transaction.payment.findMany({ where: { businessId: data.businessId, bookingId: data.bookingId, status: 'RECORDED' }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] }),
        readEffectivePayments(transaction, data.businessId, [data.bookingId]),
      ]);
      const net = new Map(effective.map((payment) => [payment.paymentId, payment.netRetainedAmountMinor]));
      for (const payment of payments) if ((net.get(payment.id) ?? 0) > 0) await applyPaymentToPlan(transaction, plan.id, payment.id, toPrismaMoney(net.get(payment.id)!));
      return this.requirePlan(transaction, data.businessId, data.bookingId);
    });
  }

  async findByBooking(data: { businessId: string; bookingId: string }): Promise<PaymentPlan | null> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.paymentPlan.findFirst({ where: data, include: planInclude });
      return row ? this.annotatePlan(transaction, row, data) : null;
    }, { isolationLevel: 'RepeatableRead' });
  }

  async replace(data: CreatePaymentPlanData): Promise<PaymentPlan> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockWritableBooking(transaction, data.businessId, data.bookingId);
      const price = await this.requireCurrentPrice(transaction, data);
      const plan = await transaction.paymentPlan.findFirst({ where: { businessId: data.businessId, bookingId: data.bookingId }, select: { id: true } });
      if (!plan) throw new Error('PAYMENT_PLAN_NOT_FOUND');
      const applications = await transaction.paymentApplication.count({ where: { installment: { paymentPlanId: plan.id } } });
      if (applications > 0) throw new Error('PAYMENT_PLAN_HAS_APPLICATIONS');
      await this.requireNoCredit(transaction, data, price);
      await this.requireOpenPlanPeriod(transaction, data.businessId, plan.id);
      await transaction.paymentPlanInstallment.deleteMany({ where: { paymentPlanId: plan.id } });
      await transaction.paymentPlan.update({ where: { id: plan.id }, data: { currency: price.currency, totalAmountMinor: toPrismaMoney(price.totalAmountMinor), updatedByUserId: data.actorUserId, installments: { create: data.installments.map((installment) => ({ ...installment, amountMinor: toPrismaMoney(installment.amountMinor) })) } } });
      return this.requirePlan(transaction, data.businessId, data.bookingId);
    });
  }

  private async lockWritableBooking(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<void> {
    const rows = await transaction.$queryRaw<{ status: BookingStatus }[]>`
      SELECT status FROM "Booking"
      WHERE id = ${bookingId} AND "businessId" = ${businessId}
      FOR UPDATE
    `;
    if (rows.length === 0) throw new Error('PAYMENT_PLAN_NOT_FOUND');
    if (![BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS].includes(rows[0].status)) {
      throw new Error('PAYMENT_PLAN_BOOKING_STATE');
    }
    await transaction.$queryRaw`SELECT id FROM "Business" WHERE id=${businessId} FOR SHARE`;
  }

  private async requireOpenPlanPeriod(transaction: Prisma.TransactionClient, businessId: string, paymentPlanId?: string): Promise<void> {
    const dates = await transaction.$queryRaw<{ date: string }[]>`SELECT to_char(clock_timestamp() AT TIME ZONE timezone, 'YYYY-MM-DD') AS date FROM "Business" WHERE id=${businessId}`;
    if (!dates[0]) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
    await assertFinancePeriodOpen(transaction, businessId, [dates[0].date], paymentPlanId ? [{ type: 'PAYMENT_PLAN', id: paymentPlanId }] : []);
  }

  private async requirePlan(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<PaymentPlan> {
    const row = await transaction.paymentPlan.findFirst({ where: { businessId, bookingId }, include: planInclude });
    if (!row) throw new Error('PAYMENT_PLAN_NOT_FOUND');
    return this.annotatePlan(transaction, row, { businessId, bookingId });
  }

  private async requireCurrentPrice(transaction: Prisma.TransactionClient, data: CreatePaymentPlanData): Promise<CurrentPricing> {
    await transaction.$queryRaw`SELECT id FROM "PricingSnapshot" WHERE "bookingId" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`;
    const price = await readCurrentPricing(transaction, data.businessId, data.bookingId);
    const installmentTotal = data.installments.reduce((sum, installment) => sum + toPrismaMoney(installment.amountMinor), 0n);
    if (!price || price.currency !== data.currency || price.totalAmountMinor !== data.totalAmountMinor || (data.currentPricingId !== undefined && price.id !== data.currentPricingId) || installmentTotal !== toPrismaMoney(price.totalAmountMinor)) throw new Error('PAYMENT_PLAN_PRICE_CHANGED');
    return price;
  }

  private async requireNoCredit(transaction: Prisma.TransactionClient, data: CreatePaymentPlanData, price: CurrentPricing): Promise<void> {
    const paid = await readBookingEffectiveAmounts(transaction, data.businessId, data.bookingId, price.currency);
    if (paid.netRetainedAmountMinor > price.totalAmountMinor) throw new Error('PAYMENT_PLAN_CREDIT_REQUIRES_RECONCILIATION');
  }

  private async annotatePlan(transaction: Prisma.TransactionClient, row: PlanRow, data: { businessId: string; bookingId: string }): Promise<PaymentPlan> {
    const [price, payments, applications] = await Promise.all([
      readCurrentPricing(transaction, data.businessId, data.bookingId),
      readEffectivePayments(transaction, data.businessId, [data.bookingId]),
      readEffectiveApplications(transaction, data.businessId, data.bookingId),
    ]);
    if (!price) throw new Error('PAYMENT_PLAN_PRICE_INVARIANT');
    const amounts = summarizeEffectivePayments(payments, price.currency);
    const paidAmountMinor = amounts.netRetainedAmountMinor;
    const plan = mapPlan(row, applications);
    const planState = { currency: plan.currency, totalAmountMinor: plan.totalAmountMinor,
      installmentTotalAmountMinor: safeSum(plan.installments.map((row) => row.amountMinor)),
      appliedAmountMinor: safeSum(plan.installments.map((row) => row.appliedAmountMinor)) };
    if (planState.appliedAmountMinor > paidAmountMinor || planState.installmentTotalAmountMinor !== plan.totalAmountMinor) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
    const needsReconciliation = needsPaymentReconciliation(price, paidAmountMinor, planState);
    return { ...plan, ...amounts, paidAmountMinor, needsReconciliation, warning: needsReconciliation ? PAYMENT_RECONCILIATION_WARNING : null };
  }
}

const planInclude = { installments: { orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] } };

function mapPlan(row: PlanRow, applications: EffectiveApplicationProjection[]): Omit<PaymentPlan, 'paidAmountMinor' | 'grossRecordedAmountMinor' | 'voidedAmountMinor' | 'refundedAmountMinor' | 'netRetainedAmountMinor' | 'financialVersion'> {
  if (row.totalAmountMinor < 0n) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  return { ...row, totalAmountMinor: fromPrismaMoney(row.totalAmountMinor), installments: row.installments.map((installment) => mapInstallment(installment, applications)) };
}

function mapInstallment(installment: InstallmentRow, applications: EffectiveApplicationProjection[]): PaymentPlan['installments'][number] {
  if (installment.amountMinor < 0n) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  const appliedAmountMinor = applications.filter((application) => application.installmentId === installment.id).reduce((sum, application) => sum + toPrismaMoney(application.effectiveAmountMinor), 0n);
  if (appliedAmountMinor > installment.amountMinor) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  return { id: installment.id, amountMinor: fromPrismaMoney(installment.amountMinor), dueDate: installment.dueDate, sortOrder: installment.sortOrder, appliedAmountMinor: fromPrismaMoney(appliedAmountMinor) };
}

function safeSum(amounts: number[]): number {
  return fromPrismaMoney(amounts.reduce((sum, amount) => sum + toPrismaMoney(amount), 0n));
}

export async function applyPaymentToPlan(transaction: Prisma.TransactionClient, paymentPlanId: string, paymentId: string, paymentAmountMinor: bigint): Promise<void> {
  void paymentAmountMinor;
  const payment = await transaction.payment.findUnique({ where: { id: paymentId }, select: { businessId: true, bookingId: true } });
  if (!payment) throw new Error('PAYMENT_APPLICATION_FINANCIAL_INVARIANT');
  const plan = await transaction.paymentPlan.findFirst({ where: { id: paymentPlanId, businessId: payment.businessId, bookingId: payment.bookingId }, select: { id: true } });
  if (!plan) throw new Error('PAYMENT_APPLICATION_FINANCIAL_INVARIANT');
  const [effective, applications] = await Promise.all([
    readEffectivePayments(transaction, payment.businessId, [payment.bookingId]),
    readEffectiveApplications(transaction, payment.businessId, payment.bookingId),
  ]);
  const state = effective.find((row) => row.paymentId === paymentId);
  if (!state) throw new Error('PAYMENT_APPLICATION_FINANCIAL_INVARIANT');
  const own = applications.filter((row) => row.paymentId === paymentId);
  // An original PK already used cannot be reused after a reversal. No auto-reapply.
  if (own.length > 0) return;
  const remaining = toPrismaMoney(state.netRetainedAmountMinor);
  if (remaining <= 0n) return;
  const installments = await transaction.paymentPlanInstallment.findMany({ where: { paymentPlanId } });
  installments.sort((left, right) => compareInstallments(left, right));
  const created = allocatePaymentApplications(paymentId, remaining, installments, applications);
  if (created.length > 0) await transaction.paymentApplication.createMany({ data: created });
}

function allocatePaymentApplications(paymentId: string, remainingAmountMinor: bigint, installments: InstallmentRow[], applications: EffectiveApplicationProjection[]): { paymentId: string; installmentId: string; amountMinor: bigint }[] {
  let remaining = remainingAmountMinor;
  const created: { paymentId: string; installmentId: string; amountMinor: bigint }[] = [];
  for (const installment of installments) {
    const applied = applications.filter((application) => application.installmentId === installment.id).reduce((sum, application) => sum + toPrismaMoney(application.effectiveAmountMinor), 0n);
    const available = installment.amountMinor - applied;
    if (available < 0n) throw new Error('PAYMENT_APPLICATION_FINANCIAL_INVARIANT');
    if (available <= 0n) continue;
    const amountMinor = remaining < available ? remaining : available;
    created.push({ paymentId, installmentId: installment.id, amountMinor });
    remaining -= amountMinor;
    if (remaining === 0n) break;
  }
  if (remaining !== 0n) throw new Error('PAYMENT_APPLICATION_OVERFLOW');
  return created;
}

function compareInstallments(left: { dueDate: Date | null; sortOrder: number; id: string }, right: { dueDate: Date | null; sortOrder: number; id: string }): number {
  const dueDate = compareNullableDates(left.dueDate, right.dueDate);
  if (dueDate !== 0) return dueDate;
  const sortOrder = left.sortOrder - right.sortOrder;
  if (sortOrder !== 0) return sortOrder;
  return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
}

function compareNullableDates(left: Date | null, right: Date | null): number {
  if (left === null) return right === null ? 0 : 1;
  if (right === null) return -1;
  return left.getTime() - right.getTime();
}
