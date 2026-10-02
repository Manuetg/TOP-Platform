import { Injectable } from '@nestjs/common';
import { Prisma, type Booking as BookingRow } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { Booking as BookingEntity, BookingBusinessNotFoundError, BookingBusinessUnavailableError, BookingNotFoundError, BookingStatus, assertBookingCapacity, type Booking } from '../../booking/booking.contract';
import { validateAvailabilityInTransaction, AvailabilityBusinessNotFoundError, AvailabilityBusinessUnavailableError, AvailabilityResourceNotFoundError } from '../../availability/availability.contract';
import { BOOKING_OPERATION_TRANSITIONS, BookingOperation, type BookingOperationData, type BookingOperationTransaction } from '../booking-operation.contract';
import { BookingOperationConflictError, BookingOperationForbiddenError } from '../application/booking-operation.errors';

type LockedBooking = BookingRow & { resources: { resourceId: string }[] };

@Injectable()
export class PrismaBookingOperationTransaction implements BookingOperationTransaction {
  constructor(private readonly prisma: PrismaService) {}

  execute(data: BookingOperationData): Promise<Booking> {
    return this.prisma.$transaction((transaction) => this.operate(transaction, data), { maxWait: 5000, timeout: 30000 });
  }

  private async operate(transaction: Prisma.TransactionClient, data: BookingOperationData): Promise<Booking> {
    const booking = await this.lockedBooking(transaction, data);
    await this.requireActiveBusiness(transaction, data.businessId);
    await this.requireAuthorizedActor(transaction, data);
    this.requireCurrentVersionAndState(booking, data);
    if (data.operation === BookingOperation.CONFIRM_WITHOUT_PAYMENT) await this.validateFreeConfirmation(transaction, data, booking);
    const updatedAt = new Date(Math.max(Date.now(), booking.updatedAt.getTime() + 1));
    const transition = BOOKING_OPERATION_TRANSITIONS[data.operation];
    const updated = await transaction.booking.updateMany({
      where: { id: data.bookingId, businessId: data.businessId, status: transition.from, updatedAt: data.expectedUpdatedAt },
      data: { status: transition.to, updatedAt },
    });
    if (updated.count !== 1) throw new BookingOperationConflictError('La reserva cambió durante la operación. Actualizá el detalle.');
    await this.audit(transaction, data, booking, updatedAt);
    return this.map({ ...booking, status: transition.to, updatedAt });
  }

  private async lockedBooking(transaction: Prisma.TransactionClient, data: BookingOperationData): Promise<LockedBooking> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${data.bookingId} AND "businessId" = ${data.businessId} FOR UPDATE`);
    const booking = await transaction.booking.findFirst({ where: { id: data.bookingId, businessId: data.businessId }, include: { resources: { select: { resourceId: true }, orderBy: { resourceId: 'asc' } } } });
    if (!booking) throw new BookingNotFoundError('La reserva no existe.');
    return booking;
  }

  private async requireActiveBusiness(transaction: Prisma.TransactionClient, businessId: string): Promise<void> {
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Business" WHERE "id" = ${businessId} FOR SHARE`);
    const business = await transaction.business.findUnique({ where: { id: businessId }, select: { status: true } });
    if (!business) throw new BookingBusinessNotFoundError('El negocio no existe.');
    if (business.status !== 'ACTIVE') throw new BookingBusinessUnavailableError('El negocio no está activo.');
  }

  private async requireAuthorizedActor(transaction: Prisma.TransactionClient, data: BookingOperationData): Promise<void> {
    const actors = await transaction.$queryRaw<{ status: string; role: string }[]>(Prisma.sql`
      SELECT actor.status, membership.role
      FROM "User" actor
      INNER JOIN "UserBusinessMembership" membership ON membership."userId" = actor.id
      WHERE actor.id = ${data.actorUserId} AND membership."businessId" = ${data.businessId}
      FOR SHARE OF actor, membership
    `);
    const actor = actors[0];
    if (!actor || actor.status !== 'ACTIVE' || !['OWNER', 'ADMIN', 'RECEPTIONIST'].includes(actor.role)) throw new BookingOperationForbiddenError('El usuario ya no tiene permiso para operar esta reserva.');
  }

  private requireCurrentVersionAndState(booking: LockedBooking, data: BookingOperationData): void {
    if (booking.updatedAt.getTime() !== data.expectedUpdatedAt.getTime()) throw new BookingOperationConflictError('La reserva cambió desde que la consultaste. Actualizá el detalle.');
    if ((booking.status as BookingStatus) !== BOOKING_OPERATION_TRANSITIONS[data.operation].from) throw new BookingOperationConflictError('La reserva no admite esta acción en su estado actual.');
  }

  private async validateFreeConfirmation(transaction: Prisma.TransactionClient, data: BookingOperationData, booking: LockedBooking): Promise<void> {
    const snapshot = await transaction.pricingSnapshot.findFirst({ where: { bookingId: data.bookingId, businessId: data.businessId }, select: { totalAmountMinor: true } });
    if (!snapshot || snapshot.totalAmountMinor !== 0n) throw new BookingOperationConflictError('Confirmar sin cobro requiere un precio acordado con total cero.');
    this.requireCompleteBooking(booking);
    for (const resource of booking.resources) await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resource.resourceId}, 0))`);
    await this.requireContactAndCapacity(transaction, data.businessId, booking);
    await this.requireAvailability(transaction, data, booking);
  }

  private requireCompleteBooking(booking: LockedBooking): void {
    if (!booking.contactId || booking.resources.length !== 1) throw new BookingOperationConflictError('La reserva requiere contacto y exactamente un recurso.');
    if (!booking.checkInDate || !booking.checkOutDate || booking.checkOutDate <= booking.checkInDate) throw new BookingOperationConflictError('La reserva requiere fechas completas válidas.');
  }

  private async requireContactAndCapacity(transaction: Prisma.TransactionClient, businessId: string, booking: LockedBooking): Promise<void> {
    const contact = await transaction.contact.findFirst({ where: { id: booking.contactId ?? '', businessId }, select: { id: true } });
    if (!contact) throw new BookingOperationConflictError('El contacto responsable no existe en el negocio.');
    await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Resource" WHERE "id" = ${booking.resources[0].resourceId} AND "businessId" = ${businessId} FOR SHARE`);
    const resource = await transaction.resource.findFirst({ where: { id: booking.resources[0].resourceId, businessId }, select: { capacityMaximum: true, capacityMaximumChildren: true } });
    if (!resource) throw new BookingOperationConflictError('El recurso no existe en el negocio.');
    assertBookingCapacity(booking.adults, booking.children, resource.capacityMaximum, resource.capacityMaximumChildren);
  }

  private async requireAvailability(transaction: Prisma.TransactionClient, data: BookingOperationData, booking: LockedBooking): Promise<void> {
    try {
      const result = await validateAvailabilityInTransaction(transaction, {
        businessId: data.businessId, resourceIds: booking.resources.map(({ resourceId }) => resourceId),
        checkInDate: booking.checkInDate!.toISOString().slice(0, 10), checkOutDate: booking.checkOutDate!.toISOString().slice(0, 10), excludeBookingId: data.bookingId,
      });
      if (!result.valid) throw new BookingOperationConflictError('La reserva tiene conflictos de disponibilidad. No se confirmó.');
    } catch (error: unknown) {
      if (error instanceof AvailabilityBusinessNotFoundError || error instanceof AvailabilityBusinessUnavailableError || error instanceof AvailabilityResourceNotFoundError) throw new BookingOperationConflictError(error.message);
      throw error;
    }
  }

  private audit(transaction: Prisma.TransactionClient, data: BookingOperationData, booking: LockedBooking, updatedAt: Date): Promise<unknown> {
    const transition = BOOKING_OPERATION_TRANSITIONS[data.operation];
    return transaction.bookingTimelineEvent.create({ data: {
      businessId: data.businessId, bookingId: data.bookingId, type: transition.event, actorUserId: data.actorUserId,
      details: {
        source: data.operation === BookingOperation.CONFIRM_WITHOUT_PAYMENT ? 'FREE_CONFIRM' : 'MANUAL',
        operation: data.operation, beforeStatus: booking.status, afterStatus: transition.to,
        beforeUpdatedAt: booking.updatedAt.toISOString(), afterUpdatedAt: updatedAt.toISOString(),
        ...(data.reason ? { reason: data.reason } : {}),
      },
    } });
  }

  private map(booking: LockedBooking): Booking {
    return BookingEntity.create({ ...booking, status: booking.status as BookingStatus, resourceIds: booking.resources.map(({ resourceId }) => resourceId) });
  }
}
