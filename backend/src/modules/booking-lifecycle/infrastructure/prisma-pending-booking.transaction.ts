import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { validateAvailabilityInTransaction } from '../../availability/availability.contract';
import { BookingAvailabilityConflictError, BookingContactNotFoundError, BookingDatesRequiredError, BookingResourceNotFoundError, BookingResourcesRequiredError, assertBookingCapacity } from '../../booking/booking.contract';
import type { PendingBookingTransaction, PendingBookingTransactionInput } from '../pending-booking.contract';
import { toPrismaMoney } from '../../../shared/infrastructure/prisma-money';

@Injectable()
export class PrismaPendingBookingTransaction implements PendingBookingTransaction {
  constructor(private readonly prisma: PrismaService) {}
  async create(input: PendingBookingTransactionInput): Promise<string> {
    const data = input.data;
    if (!data.contactId) throw new BookingContactNotFoundError('La reserva requiere un contacto responsable.');
    if (!data.checkInDate || !data.checkOutDate) throw new BookingDatesRequiredError('La reserva requiere fechas completas.');
    if (data.resourceIds.length !== 1) throw new BookingResourcesRequiredError('La reserva requiere exactamente un recurso.');
    const checkInDate = data.checkInDate;
    const checkOutDate = data.checkOutDate;
    const contactId = data.contactId;
    return this.prisma.$transaction(async (transaction) => {
      for (const resourceId of [...data.resourceIds].sort()) {
        await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resourceId}, 0))`);
      }
      const availability = await validateAvailabilityInTransaction(transaction, {
        businessId: data.businessId, resourceIds: data.resourceIds,
        checkInDate: checkInDate.toISOString().slice(0, 10), checkOutDate: checkOutDate.toISOString().slice(0, 10),
      });
      if (!availability.valid) throw new BookingAvailabilityConflictError('La reserva tiene conflictos de disponibilidad.');
      const contact = await transaction.contact.findFirst({ where: { id: contactId, businessId: data.businessId }, select: { id: true } });
      if (!contact) throw new BookingContactNotFoundError('El contacto no existe.');
      const resource = await transaction.resource.findFirst({ where: { id: data.resourceIds[0], businessId: data.businessId }, select: { capacityMaximum: true, capacityMaximumChildren: true } });
      if (!resource) throw new BookingResourceNotFoundError('El recurso no existe.');
      assertBookingCapacity(data.adults, data.children, resource.capacityMaximum, resource.capacityMaximumChildren);
      const snapshot = await input.preparePricing();
      const booking = await transaction.booking.create({ data: {
        businessId: data.businessId, status: 'PENDING', contactId, checkInDate, checkOutDate,
        adults: data.adults, children: data.children, notes: data.notes,
        resources: { create: data.resourceIds.map((resourceId) => ({ resourceId })) },
      }, select: { id: true } });
      await transaction.pricingSnapshot.create({ data: {
        businessId: data.businessId, bookingId: booking.id, currency: snapshot.currency,
        totalAmountMinor: toPrismaMoney(snapshot.totalAmountMinor), items: snapshot.items as Prisma.InputJsonValue,
      } });
      for (const type of ['BOOKING_CREATED', 'BOOKING_SUBMITTED'] as const) {
        await transaction.bookingTimelineEvent.create({ data: { businessId: data.businessId, bookingId: booking.id, type, actorUserId: data.actorUserId ?? null, details: {} } });
      }
      return booking.id;
    }, { maxWait: 5000, timeout: 30000 });
  }
}
