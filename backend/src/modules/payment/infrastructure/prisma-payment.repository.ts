import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { Payment, PaymentMethod, PaymentRepository, PaymentStatus, PublicPayment, RegisterPaymentData } from '../domain/payment';
import { applyPaymentToPlan } from './prisma-payment-plan.repository';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import type { Payment as PrismaPayment } from '@prisma/client';

type RegisterPaymentResult = { payment: Payment; duplicate: boolean };

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async register(data: RegisterPaymentData, totalAmountMinor: number): Promise<RegisterPaymentResult> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRawUnsafe('SELECT id FROM "Booking" WHERE id = $1 FOR UPDATE', data.bookingId);
      const prior = await transaction.payment.findUnique({ where: { businessId_idempotencyKey: { businessId: data.businessId, idempotencyKey: data.idempotencyKey } } });
      if (prior) {
        if (prior.requestFingerprint !== data.requestFingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
        return { payment: this.map(prior), duplicate: true };
      }
      const registered = await transaction.payment.aggregate({ where: { bookingId: data.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
      if ((registered._sum.amountMinor ?? 0n) + toPrismaMoney(data.amountMinor) > toPrismaMoney(totalAmountMinor)) throw new Error('OVERPAYMENT');
      const payment = await transaction.payment.create({ data: { ...data, amountMinor: toPrismaMoney(data.amountMinor) } });
      const plan = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true, businessId: true } });
      if (plan?.businessId === data.businessId) await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
      return { payment: this.map(payment), duplicate: false };
    });
  }

  async listByBooking(input: Parameters<PaymentRepository['listByBooking']>[0]): Promise<PublicPayment[]> {
    const before = input.before;
    const rows = await this.prisma.payment.findMany({
      where: {
        businessId: input.businessId,
        bookingId: input.bookingId,
        ...(before ? {
          OR: [
            { paidAt: { lt: before.paidAt } },
            { paidAt: before.paidAt, createdAt: { lt: before.createdAt } },
            { paidAt: before.paidAt, createdAt: before.createdAt, id: { lt: before.id } },
          ],
        } : {}),
      },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: {
        id: true,
        bookingId: true,
        amountMinor: true,
        currency: true,
        method: true,
        reference: true,
        note: true,
        paidAt: true,
        createdAt: true,
        recordedByUserId: true,
        status: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      amountMinor: fromPrismaMoney(row.amountMinor),
      method: row.method as PaymentMethod,
      status: row.status as PaymentStatus,
    }));
  }

  private map(row: PrismaPayment): Payment {
    return {
      ...row,
      amountMinor: fromPrismaMoney(row.amountMinor),
      method: row.method as PaymentMethod,
      status: row.status as PaymentStatus,
    };
  }
}
