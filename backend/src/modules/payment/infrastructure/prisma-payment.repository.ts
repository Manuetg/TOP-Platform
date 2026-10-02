import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { Payment, PaymentMethod, PaymentRepository, PaymentStatus, PublicPayment, RegisterPaymentData } from '../domain/payment';
import { applyPaymentToPlan } from './prisma-payment-plan.repository';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { Prisma, type Payment as PrismaPayment, type PricingSnapshot } from '@prisma/client';
import { validateAvailabilityInTransaction, AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError } from '../../availability/availability.contract';
import { PaymentConflictError, PaymentInputError, PaymentNotFoundError } from '../application/register-payment.use-case';
import { assertBookingCapacity, InvalidBookingInputError } from '../../booking/booking.contract';

type RegisterPaymentResult = { payment: Payment; duplicate: boolean };
interface PayableBooking {
  status: string; contactId: string | null; checkInDate: Date | null; checkOutDate: Date | null;
  adults: number | null; children: number | null;
  resources: { resourceId: string }[];
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByIdempotencyKey(businessId: string, idempotencyKey: string): Promise<Payment | null> {
    const row = await this.prisma.payment.findUnique({ where: { businessId_idempotencyKey: { businessId, idempotencyKey } } });
    return row ? this.map(row) : null;
  }

  async register(data: RegisterPaymentData, totalAmountMinor: number): Promise<RegisterPaymentResult> {
    // Kept for compatibility; the locked, persisted price is authoritative.
    void totalAmountMinor;
    if (!Number.isSafeInteger(data.amountMinor) || data.amountMinor <= 0) throw new PaymentInputError('El monto debe ser un entero positivo seguro.');
    return this.prisma.$transaction(
      (transaction) => this.registerInsideTransaction(transaction, data),
      { maxWait: 5000, timeout: 30000 },
    );
  }

  private async registerInsideTransaction(transaction: Prisma.TransactionClient, data: RegisterPaymentData): Promise<RegisterPaymentResult> {
    const keyLock = data.businessId + ':payment:' + data.idempotencyKey;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${keyLock}, 0))`);
    const prior = await transaction.payment.findUnique({ where: { businessId_idempotencyKey: { businessId: data.businessId, idempotencyKey: data.idempotencyKey } } });
    if (prior) {
      if (prior.requestFingerprint !== data.requestFingerprint) throw new Error('IDEMPOTENCY_CONFLICT');
      return { payment: this.map(prior), duplicate: true };
    }
    const booking = await this.payableBooking(transaction, data);
    const snapshot = await this.agreedPrice(transaction, data);
    await this.ensureNoOverpayment(transaction, data, snapshot.totalAmountMinor);
    if (booking.status === 'PENDING') await this.validatePending(transaction, data, booking);
    const payment = await transaction.payment.create({ data: { ...data, currency: snapshot.currency, amountMinor: toPrismaMoney(data.amountMinor) } });
    await this.applyToPlan(transaction, data, payment);
    if (booking.status === 'PENDING') await this.confirmFromPending(transaction, data, payment.id);
    return { payment: this.map(payment), duplicate: false };
  }

  private async payableBooking(transaction: Prisma.TransactionClient, data: RegisterPaymentData): Promise<PayableBooking> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`);
    const booking = await transaction.booking.findFirst({
      where: { id: data.bookingId, businessId: data.businessId },
      select: { status: true, contactId: true, checkInDate: true, checkOutDate: true, adults: true, children: true, resources: { select: { resourceId: true }, orderBy: { resourceId: 'asc' } } },
    });
    if (!booking) throw new PaymentNotFoundError('La reserva no existe.');
    if (!['PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(booking.status)) throw new PaymentConflictError('La reserva no admite pagos en su estado actual.');
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${data.businessId} FOR SHARE`);
    const business = await transaction.business.findUnique({ where: { id: data.businessId }, select: { status: true } });
    if (!business) throw new PaymentNotFoundError('El negocio no existe.');
    if (business.status === 'ARCHIVED') throw new PaymentConflictError('El negocio está archivado.');
    return booking;
  }

  private async agreedPrice(transaction: Prisma.TransactionClient, data: RegisterPaymentData): Promise<PricingSnapshot> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "PricingSnapshot" WHERE "bookingId" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`);
    const snapshot = await transaction.pricingSnapshot.findUnique({ where: { bookingId: data.bookingId } });
    if (!snapshot || snapshot.businessId !== data.businessId) throw new PaymentConflictError('La reserva no tiene un precio acordado persistido.');
    if (snapshot.currency !== data.currency) throw new PaymentConflictError('La moneda del precio acordado cambió.');
    return snapshot;
  }

  private async ensureNoOverpayment(transaction: Prisma.TransactionClient, data: RegisterPaymentData, totalAmountMinor: bigint): Promise<void> {
    const registered = await transaction.payment.aggregate({ where: { businessId: data.businessId, bookingId: data.bookingId, status: 'RECORDED' }, _sum: { amountMinor: true } });
    const paidAmountMinor = registered._sum.amountMinor ?? 0n;
    if (totalAmountMinor < 0n || paidAmountMinor < 0n) throw new Error('PAYMENT_FINANCIAL_INVARIANT');
    if (paidAmountMinor + toPrismaMoney(data.amountMinor) > totalAmountMinor) throw new Error('OVERPAYMENT');
  }

  private async validatePending(transaction: Prisma.TransactionClient, data: RegisterPaymentData, booking: PayableBooking): Promise<void> {
    if (!booking.contactId || !booking.checkInDate || !booking.checkOutDate || booking.resources.length !== 1) throw new PaymentConflictError('La reserva pendiente requiere contacto, fechas y un recurso para confirmar.');
    const contact = await transaction.contact.findFirst({ where: { id: booking.contactId, businessId: data.businessId }, select: { id: true } });
    if (!contact) throw new PaymentConflictError('El contacto de la reserva no existe en el negocio.');
    for (const resource of booking.resources) {
      await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resource.resourceId}, 0))`);
    }
    await this.available(transaction, {
      businessId: data.businessId, resourceIds: booking.resources.map(({ resourceId }) => resourceId),
      checkInDate: booking.checkInDate.toISOString().slice(0, 10), checkOutDate: booking.checkOutDate.toISOString().slice(0, 10), excludeBookingId: data.bookingId,
    });
    await this.ensureCapacity(transaction, data.businessId, booking);
  }

  private async ensureCapacity(transaction: Prisma.TransactionClient, businessId: string, booking: PayableBooking): Promise<void> {
    const resource = await transaction.resource.findFirst({ where: { id: booking.resources[0].resourceId, businessId }, select: { capacityMaximum: true, capacityMaximumChildren: true } });
    if (!resource) throw new PaymentConflictError('El recurso de la reserva no existe.');
    try { assertBookingCapacity(booking.adults, booking.children, resource.capacityMaximum, resource.capacityMaximumChildren); }
    catch (error: unknown) {
      if (error instanceof InvalidBookingInputError) throw new PaymentConflictError('La reserva supera la capacidad vigente del recurso; no se registró el pago.');
      throw error;
    }
  }

  private async available(transaction: Prisma.TransactionClient, input: Parameters<typeof validateAvailabilityInTransaction>[1]): Promise<void> {
    try {
      const availability = await validateAvailabilityInTransaction(transaction, input);
      if (!availability.valid) throw new PaymentConflictError('La reserva tiene conflictos de disponibilidad; no se registró el pago.');
    } catch (error: unknown) {
      if (error instanceof AvailabilityBusinessNotFoundError || error instanceof AvailabilityBusinessUnavailableError || error instanceof AvailabilityResourceNotFoundError) throw new PaymentConflictError(error.message);
      throw error;
    }
  }

  private async applyToPlan(transaction: Prisma.TransactionClient, data: RegisterPaymentData, payment: PrismaPayment): Promise<void> {
    const plan = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true, businessId: true } });
    if (plan?.businessId === data.businessId) await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
  }

  private async confirmFromPending(transaction: Prisma.TransactionClient, data: RegisterPaymentData, paymentId: string): Promise<void> {
    const updated = await transaction.booking.updateMany({ where: { id: data.bookingId, businessId: data.businessId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    if (updated.count !== 1) throw new PaymentConflictError('La reserva cambió de estado durante el registro del pago.');
    await transaction.bookingTimelineEvent.create({ data: { businessId: data.businessId, bookingId: data.bookingId, type: 'BOOKING_CONFIRMED', actorUserId: data.recordedByUserId, details: { paymentId } } });
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
