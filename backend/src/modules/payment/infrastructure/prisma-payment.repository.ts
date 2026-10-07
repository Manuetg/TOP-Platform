import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { Payment, PaymentMethod, PaymentRepository, PaymentStatus, type EffectivePaymentHistoryItem, RegisterPaymentData } from '../domain/payment';
import { applyPaymentToPlan } from './prisma-payment-plan.repository';
import { fromPrismaMoney, toPrismaMoney } from '../../../shared/infrastructure/prisma-money';
import { assertFinancePeriodOpen } from '../../../shared/infrastructure/finance-period.guard';
import { Prisma, type Payment as PrismaPayment } from '@prisma/client';
import { readCurrentPricing, type CurrentPricing } from '../../pricing/pricing.contract';
import { validateAvailabilityInTransaction, AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError } from '../../availability/availability.contract';
import { PaymentConflictError, PaymentInputError, PaymentNotFoundError } from '../application/register-payment.use-case';
import { assertBookingCapacity, InvalidBookingInputError } from '../../booking/booking.contract';
import { needsPaymentReconciliation } from '../domain/financial-reconciliation';
import { readBookingEffectiveAmounts, readEffectiveApplications, readEffectivePayments, summarizeEffectivePayments } from './prisma-payment-effective.reader';

type RegisterPaymentResult = { payment: Payment; duplicate: boolean };
interface PayableBooking {
  status: string; contactId: string | null; checkInDate: Date | null; checkOutDate: Date | null;
  adults: number | null; children: number | null;
  resources: { resourceId: string }[];
}

@Injectable()
export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findCurrentPricing(businessId: string, bookingId: string): Promise<CurrentPricing | null> {
    return this.prisma.$transaction((transaction) => readCurrentPricing(transaction, businessId, bookingId), { isolationLevel: 'RepeatableRead' });
  }

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
    await this.ensureNoOverpayment(transaction, data, toPrismaMoney(snapshot.totalAmountMinor));
    if (booking.status === 'PENDING') await this.validatePending(transaction, data, booking);
    await this.requireOpenPaymentPeriod(transaction, data);
    const payment = await transaction.payment.create({ data: { ...data, currency: snapshot.currency, amountMinor: toPrismaMoney(data.amountMinor) } });
    await this.applyToPlan(transaction, data, payment, snapshot);
    if (booking.status === 'PENDING') await this.confirmFromPending(transaction, data, payment.id);
    return { payment: this.map(payment), duplicate: false };
  }

  private async requireOpenPaymentPeriod(transaction: Prisma.TransactionClient, data: RegisterPaymentData): Promise<void> {
    const dates = await transaction.$queryRaw<{ date: string }[]>`SELECT to_char(${data.paidAt}::timestamptz AT TIME ZONE timezone, 'YYYY-MM-DD') AS date FROM "Business" WHERE id=${data.businessId}`;
    if (!dates[0]) throw new PaymentConflictError('No se puede determinar la fecha local del cobro.');
    await assertFinancePeriodOpen(transaction, data.businessId, [dates[0].date]);
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

  private async agreedPrice(transaction: Prisma.TransactionClient, data: RegisterPaymentData): Promise<CurrentPricing> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "PricingSnapshot" WHERE "bookingId" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`);
    const snapshot = await readCurrentPricing(transaction, data.businessId, data.bookingId);
    if (!snapshot || snapshot.businessId !== data.businessId) throw new PaymentConflictError('La reserva no tiene un precio acordado persistido.');
    if (snapshot.currency !== data.currency) throw new PaymentConflictError('La moneda del precio acordado cambió.');
    return snapshot;
  }

  private async ensureNoOverpayment(transaction: Prisma.TransactionClient, data: RegisterPaymentData, totalAmountMinor: bigint): Promise<void> {
    const amounts = await readBookingEffectiveAmounts(transaction, data.businessId, data.bookingId, data.currency);
    const paidAmountMinor = toPrismaMoney(amounts.netRetainedAmountMinor);
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

  private async applyToPlan(transaction: Prisma.TransactionClient, data: RegisterPaymentData, payment: PrismaPayment, price: CurrentPricing): Promise<void> {
    const plan = await transaction.paymentPlan.findUnique({ where: { bookingId: data.bookingId }, select: { id: true, businessId: true, currency: true, totalAmountMinor: true } });
    if (!plan || plan.businessId !== data.businessId) return;
    const matchesPrice = plan.currency === price.currency && plan.totalAmountMinor === toPrismaMoney(price.totalAmountMinor);
    if (!matchesPrice) return;
    if (!await this.planIsReconciled(transaction, data, payment.id, plan, price)) return;
    await applyPaymentToPlan(transaction, plan.id, payment.id, payment.amountMinor);
  }

  private async planIsReconciled(transaction: Prisma.TransactionClient, data: RegisterPaymentData, paymentId: string, plan: { id: string; currency: string; totalAmountMinor: bigint }, price: CurrentPricing): Promise<boolean> {
    const [payments, applications] = await Promise.all([
      readEffectivePayments(transaction, data.businessId, [data.bookingId]),
      readEffectiveApplications(transaction, data.businessId, data.bookingId),
    ]);
    const paidAmountMinor = summarizeEffectivePayments(payments.filter((payment) => payment.paymentId !== paymentId), price.currency).netRetainedAmountMinor;
    const appliedAmountMinor = fromPrismaMoney(applications.reduce((sum, application) => sum + toPrismaMoney(application.effectiveAmountMinor), 0n));
    if (appliedAmountMinor > paidAmountMinor) throw new Error('PAYMENT_APPLICATION_FINANCIAL_INVARIANT');
    const planTotalAmountMinor = fromPrismaMoney(plan.totalAmountMinor);
    return !needsPaymentReconciliation(price, paidAmountMinor, { currency: plan.currency, totalAmountMinor: planTotalAmountMinor, installmentTotalAmountMinor: planTotalAmountMinor, appliedAmountMinor });
  }

  private async confirmFromPending(transaction: Prisma.TransactionClient, data: RegisterPaymentData, paymentId: string): Promise<void> {
    const updated = await transaction.booking.updateMany({ where: { id: data.bookingId, businessId: data.businessId, status: 'PENDING' }, data: { status: 'CONFIRMED' } });
    if (updated.count !== 1) throw new PaymentConflictError('La reserva cambió de estado durante el registro del pago.');
    await transaction.bookingTimelineEvent.create({ data: { businessId: data.businessId, bookingId: data.bookingId, type: 'BOOKING_CONFIRMED', actorUserId: data.recordedByUserId, details: { paymentId } } });
  }

  async listByBooking(input: Parameters<PaymentRepository['listByBooking']>[0]): Promise<EffectivePaymentHistoryItem[]> {
    return this.prisma.$transaction(async (transaction) => {
    const before = input.before;
    const rows = await transaction.payment.findMany({
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
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);
    const [effective, adjustments] = await Promise.all([
      readEffectivePayments(transaction, input.businessId, [input.bookingId], ids),
      transaction.paymentAdjustment.findMany({ where: { businessId: input.businessId, bookingId: input.bookingId, paymentId: { in: ids } }, orderBy: [{ paymentId: 'asc' }, { sequence: 'asc' }], select: { id: true, paymentId: true, kind: true, amountMinor: true, occurredAt: true, createdAt: true, sequence: true } }),
    ]);
    const states = new Map(effective.map((state) => [state.paymentId, state]));
    return rows.map((row): EffectivePaymentHistoryItem => {
      const state = states.get(row.id);
      if (!state) throw new Error('PAYMENT_HISTORY_EFFECTIVE_INVARIANT');
      return {
      ...row,
      amountMinor: fromPrismaMoney(row.amountMinor),
      method: row.method as PaymentMethod,
      status: row.status as PaymentStatus,
      grossRecordedAmountMinor: state.grossRecordedAmountMinor,
      voidedAmountMinor: state.voidedAmountMinor,
      refundedAmountMinor: state.refundedAmountMinor,
      netRetainedAmountMinor: state.netRetainedAmountMinor,
      paymentVersion: state.paymentVersion,
      effectiveStatus: effectiveStatus(state),
      adjustments: adjustments.filter((adjustment) => adjustment.paymentId === row.id).map((adjustment) => ({ id: adjustment.id, kind: adjustment.kind as 'VOID' | 'REFUND', amountMinor: fromPrismaMoney(adjustment.amountMinor), occurredAt: adjustment.occurredAt, createdAt: adjustment.createdAt, sequence: adjustment.sequence })),
    }; });
    }, { isolationLevel: 'RepeatableRead' });
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

function effectiveStatus(state: { voidedAmountMinor: number; refundedAmountMinor: number; netRetainedAmountMinor: number }): EffectivePaymentHistoryItem['effectiveStatus'] {
  if (state.voidedAmountMinor > 0) return 'VOIDED';
  if (state.refundedAmountMinor === 0) return 'RETAINED';
  return state.netRetainedAmountMinor === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
}
