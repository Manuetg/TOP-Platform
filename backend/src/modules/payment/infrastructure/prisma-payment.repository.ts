import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { Payment, PaymentRepository, RegisterPaymentData } from '../domain/payment';
import { applyPaymentToPlan } from './prisma-payment-plan.repository';

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
        return { payment: prior as Payment, duplicate: true };
      }
      const registered = await transaction.payment.aggregate({ where: { bookingId: data.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
      if ((registered._sum.amountMinor ?? 0) + data.amountMinor > totalAmountMinor) throw new Error('OVERPAYMENT');
      const payment = await transaction.payment.create({ data });
      const plan = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true, businessId: true } });
      if (plan?.businessId === data.businessId) await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
      return { payment: payment as Payment, duplicate: false };
    });
  }
}
