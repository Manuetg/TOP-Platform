import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { BookingStatus } from '../../booking/booking.contract';
import { PrismaService } from '../../business/business.contract';
import type { CreatePaymentPlanData, PaymentPlan, PaymentPlanRepository } from '../domain/payment-plan';

interface InstallmentRow {
  id: string;
  amountMinor: number;
  dueDate: Date | null;
  sortOrder: number;
  applications: { amountMinor: number }[];
}

interface PlanRow {
  id: string;
  businessId: string;
  bookingId: string;
  currency: string;
  totalAmountMinor: number;
  createdByUserId: string;
  updatedByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  installments: InstallmentRow[];
}

@Injectable()
export class PrismaPaymentPlanRepository implements PaymentPlanRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreatePaymentPlanData): Promise<PaymentPlan> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockWritableBooking(transaction, data.businessId, data.bookingId);
      const existing = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true } });
      if (existing) throw new Error('PAYMENT_PLAN_EXISTS');
      const plan = await transaction.paymentPlan.create({ data: { businessId: data.businessId, bookingId: data.bookingId, currency: data.currency, totalAmountMinor: data.totalAmountMinor, createdByUserId: data.actorUserId, updatedByUserId: data.actorUserId, installments: { create: data.installments } }, select: { id: true } });
      const payments = await transaction.payment.findMany({ where: { businessId: data.businessId, bookingId: data.bookingId, status: 'RECORDED' }, orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }] });
      for (const payment of payments) await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
      return this.requirePlan(transaction, data.businessId, data.bookingId);
    });
  }

  async findByBooking(data: { businessId: string; bookingId: string }): Promise<PaymentPlan | null> {
    const row = await this.prisma.paymentPlan.findFirst({ where: data, include: planInclude });
    return row ? mapPlan(row) : null;
  }

  async replace(data: CreatePaymentPlanData): Promise<PaymentPlan> {
    return this.prisma.$transaction(async (transaction) => {
      await this.lockWritableBooking(transaction, data.businessId, data.bookingId);
      const plan = await transaction.paymentPlan.findFirst({ where: { businessId: data.businessId, bookingId: data.bookingId }, select: { id: true } });
      if (!plan) throw new Error('PAYMENT_PLAN_NOT_FOUND');
      const applications = await transaction.paymentApplication.count({ where: { installment: { paymentPlanId: plan.id } } });
      if (applications > 0) throw new Error('PAYMENT_PLAN_HAS_APPLICATIONS');
      await transaction.paymentPlanInstallment.deleteMany({ where: { paymentPlanId: plan.id } });
      await transaction.paymentPlan.update({ where: { id: plan.id }, data: { currency: data.currency, totalAmountMinor: data.totalAmountMinor, updatedByUserId: data.actorUserId, installments: { create: data.installments } } });
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
    return mapPlan(row);
  }
}

const planInclude = { installments: { include: { applications: { select: { amountMinor: true } } }, orderBy: [{ sortOrder: 'asc' as const }, { id: 'asc' as const }] } };

function mapPlan(row: PlanRow): PaymentPlan {
  return { ...row, installments: row.installments.map((installment) => ({ id: installment.id, amountMinor: installment.amountMinor, dueDate: installment.dueDate, sortOrder: installment.sortOrder, appliedAmountMinor: installment.applications.reduce((sum, application) => sum + application.amountMinor, 0) })) };
}

export async function applyPaymentToPlan(transaction: Prisma.TransactionClient, paymentPlanId: string, paymentId: string, paymentAmountMinor: number): Promise<void> {
  const existing = await transaction.paymentApplication.aggregate({ where: { paymentId }, _sum: { amountMinor: true } });
  let remaining = paymentAmountMinor - (existing._sum.amountMinor ?? 0);
  if (remaining <= 0) return;
  const installments = await transaction.paymentPlanInstallment.findMany({ where: { paymentPlanId }, include: { applications: { select: { amountMinor: true } } } });
  installments.sort((left, right) => compareInstallments(left, right));
  const applications: { paymentId: string; installmentId: string; amountMinor: number }[] = [];
  for (const installment of installments) {
    const applied = installment.applications.reduce((sum, application) => sum + application.amountMinor, 0);
    const available = installment.amountMinor - applied;
    if (available <= 0) continue;
    const amountMinor = Math.min(remaining, available);
    applications.push({ paymentId, installmentId: installment.id, amountMinor });
    remaining -= amountMinor;
    if (remaining === 0) break;
  }
  if (remaining !== 0) throw new Error('PAYMENT_APPLICATION_OVERFLOW');
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
