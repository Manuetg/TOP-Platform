import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BookingStatus } from '../../booking/booking.contract';
import { PrismaService } from '../../business/business.contract';
import type { CreatePaymentPlanData, PaymentPlan, PaymentPlanRepository } from '../domain/payment-plan';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { readCurrentPricing, type CurrentPricing } from '../../pricing/pricing.contract';
import { needsPaymentReconciliation, PAYMENT_RECONCILIATION_WARNING } from '../domain/financial-reconciliation';

interface InstallmentRow {
  id: string;
  amountMinor: bigint;
  dueDate: Date | null;
  sortOrder: number;
  applications: { amountMinor: bigint }[];
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
      const plan = await transaction.paymentPlan.create({ data: { businessId: data.businessId, bookingId: data.bookingId, currency: price.currency, totalAmountMinor: toPrismaMoney(price.totalAmountMinor), createdByUserId: data.actorUserId, updatedByUserId: data.actorUserId, installments: { create: data.installments.map((installment) => ({ ...installment, amountMinor: toPrismaMoney(installment.amountMinor) })) } }, select: { id: true } });
      const payments = await transaction.payment.findMany({ where: { businessId: data.businessId, bookingId: data.bookingId, status: 'RECORDED' }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      for (const payment of payments) await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
      return this.requirePlan(transaction, data.businessId, data.bookingId);
    });
  }

  async findByBooking(data: { businessId: string; bookingId: string }): Promise<PaymentPlan | null> {
    return this.prisma.$transaction(async (transaction) => {
      const row = await transaction.paymentPlan.findFirst({ where: data, include: planInclude });
      return row ? this.annotatePlan(transaction, mapPlan(row), data) : null;
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
  }

  private async requirePlan(transaction: Prisma.TransactionClient, businessId: string, bookingId: string): Promise<PaymentPlan> {
    const row = await transaction.paymentPlan.findFirst({ where: { businessId, bookingId }, include: planInclude });
    if (!row) throw new Error('PAYMENT_PLAN_NOT_FOUND');
    return this.annotatePlan(transaction, mapPlan(row), { businessId, bookingId });
  }

  private async requireCurrentPrice(transaction: Prisma.TransactionClient, data: CreatePaymentPlanData): Promise<CurrentPricing> {
    await transaction.$queryRaw`SELECT id FROM "PricingSnapshot" WHERE "bookingId" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`;
    const price = await readCurrentPricing(transaction, data.businessId, data.bookingId);
    const installmentTotal = data.installments.reduce((sum, installment) => sum + toPrismaMoney(installment.amountMinor), 0n);
    if (!price || price.currency !== data.currency || price.totalAmountMinor !== data.totalAmountMinor || (data.currentPricingId !== undefined && price.id !== data.currentPricingId) || installmentTotal !== toPrismaMoney(price.totalAmountMinor)) throw new Error('PAYMENT_PLAN_PRICE_CHANGED');
    return price;
  }

  private async requireNoCredit(transaction: Prisma.TransactionClient, data: CreatePaymentPlanData, price: CurrentPricing): Promise<void> {
    const paid = await transaction.payment.aggregate({ where: { businessId: data.businessId, bookingId: data.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
    if ((paid._sum.amountMinor ?? 0n) > toPrismaMoney(price.totalAmountMinor)) throw new Error('PAYMENT_PLAN_CREDIT_REQUIRES_RECONCILIATION');
  }

  private async annotatePlan(transaction: Prisma.TransactionClient, plan: PaymentPlan, data: { businessId: string; bookingId: string }): Promise<PaymentPlan> {
    const [price, payments] = await Promise.all([
      readCurrentPricing(transaction, data.businessId, data.bookingId),
      transaction.payment.findMany({ where: { ...data, status: 'RECORDED' }, select: { currency: true, amountMinor: true } }),
    ]);
    if (!price) throw new Error('PAYMENT_PLAN_PRICE_INVARIANT');
    const paidAmountMinor = effectivePaidAmount(payments, price.currency);
    const planState = { currency: plan.currency, totalAmountMinor: plan.totalAmountMinor,
      installmentTotalAmountMinor: safeSum(plan.installments.map((row) => row.amountMinor)),
      appliedAmountMinor: safeSum(plan.installments.map((row) => row.appliedAmountMinor)) };
    if (planState.appliedAmountMinor > paidAmountMinor || planState.installmentTotalAmountMinor !== plan.totalAmountMinor) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
    const needsReconciliation = needsPaymentReconciliation(price, paidAmountMinor, planState);
    return { ...plan, needsReconciliation, warning: needsReconciliation ? PAYMENT_RECONCILIATION_WARNING : null };
  }
}

const planInclude = { installments: { include: { applications: { select: { amountMinor: true } } }, orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] } };

function mapPlan(row: PlanRow): PaymentPlan {
  if (row.totalAmountMinor < 0n) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  return { ...row, totalAmountMinor: fromPrismaMoney(row.totalAmountMinor), installments: row.installments.map(mapInstallment) };
}

function mapInstallment(installment: InstallmentRow): PaymentPlan['installments'][number] {
  if (installment.amountMinor < 0n || installment.applications.some((row) => row.amountMinor < 0n)) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  const appliedAmountMinor = installment.applications.reduce((sum, application) => sum + application.amountMinor, 0n);
  if (appliedAmountMinor > installment.amountMinor) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  return { id: installment.id, amountMinor: fromPrismaMoney(installment.amountMinor), dueDate: installment.dueDate, sortOrder: installment.sortOrder, appliedAmountMinor: fromPrismaMoney(appliedAmountMinor) };
}

function effectivePaidAmount(payments: { currency: string; amountMinor: bigint }[], currency: string): number {
  if (payments.some((row) => row.currency !== currency || row.amountMinor < 0n)) throw new Error('PAYMENT_PLAN_FINANCIAL_INVARIANT');
  return fromPrismaMoney(payments.reduce((sum, row) => sum + row.amountMinor, 0n));
}

function safeSum(amounts: number[]): number {
  return fromPrismaMoney(amounts.reduce((sum, amount) => sum + toPrismaMoney(amount), 0n));
}

export async function applyPaymentToPlan(transaction: Prisma.TransactionClient, paymentPlanId: string, paymentId: string, paymentAmountMinor: bigint): Promise<void> {
  const existing = await transaction.paymentApplication.aggregate({ where: { paymentId }, _sum: { amountMinor: true } });
  let remaining = paymentAmountMinor - (existing._sum.amountMinor ?? 0n);
  if (remaining <= 0n) return;
  const installments = await transaction.paymentPlanInstallment.findMany({ where: { paymentPlanId }, include: { applications: { select: { amountMinor: true } } } });
  installments.sort((left, right) => compareInstallments(left, right));
  const applications: { paymentId: string; installmentId: string; amountMinor: bigint }[] = [];
  for (const installment of installments) {
    const applied = installment.applications.reduce((sum, application) => sum + application.amountMinor, 0n);
    const available = installment.amountMinor - applied;
    if (available <= 0n) continue;
    const amountMinor = remaining < available ? remaining : available;
    applications.push({ paymentId, installmentId: installment.id, amountMinor });
    remaining -= amountMinor;
    if (remaining === 0n) break;
  }
  if (remaining !== 0n) throw new Error('PAYMENT_APPLICATION_OVERFLOW');
  if (applications.length > 0) await transaction.paymentApplication.createMany({ data: applications });
}

function compareInstallments(left: { dueDate: Date | null; sortOrder: number; id: string }, right: { dueDate: Date | null; sortOrder: number; id: string }): number {
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
