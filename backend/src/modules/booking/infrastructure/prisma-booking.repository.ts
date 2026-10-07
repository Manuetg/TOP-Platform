import { Injectable } from '@nestjs/common';
import { Prisma, type Booking as PrismaBooking, type BookingResource } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import type { BookingData, BookingListFilters, BookingRepository } from '../domain/booking.repository';
import type { BlockingBooking } from '../booking.contract';
import { BookingTimelineEventType } from '../domain/booking-timeline-event';
import { validateAvailabilityInTransaction } from '../../availability/availability.contract';
import { BookingAvailabilityConflictError, BookingContactNotFoundError, BookingContactRequiredError, BookingDatesRequiredError, BookingResourcesRequiredError } from '../application/booking.errors';
import { assertBookingCapacity } from '../application/booking.validation';

type BookingRow = PrismaBooking & { resources: BookingResource[] };
const includeResources = { resources: { orderBy: { resourceId: 'asc' as const } } };

@Injectable()
export class PrismaBookingRepository implements BookingRepository {
  constructor(private readonly prisma: PrismaService) {}
  async create(data: BookingData): Promise<Booking> {
    const row = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.booking.create({ data: { businessId: data.businessId, status: 'DRAFT', contactId: data.contactId, checkInDate: data.checkInDate, checkOutDate: data.checkOutDate, adults: data.adults, children: data.children, notes: data.notes, resources: { create: data.resourceIds.map((resourceId) => ({ resourceId })) } }, include: includeResources });
      await transaction.bookingTimelineEvent.create({ data: { businessId: data.businessId, bookingId: created.id, type: BookingTimelineEventType.BOOKING_CREATED, actorUserId: data.actorUserId ?? null, details: {} } });
      return created;
    });
    return this.map(row);
  }
  async findByIdAndBusinessId(id: string, businessId: string): Promise<Booking | null> {
    const row = await this.prisma.booking.findFirst({ where: { id, businessId }, include: includeResources });
    return row ? this.map(row) : null;
  }
  async listByBusinessId(businessId: string, filters: BookingListFilters): Promise<Booking[]> {
    const rows = await this.prisma.booking.findMany({ where: { businessId, ...(filters.status ? { status: filters.status } : {}), ...(filters.contactId ? { contactId: filters.contactId } : {}), ...(filters.resourceId ? { resources: { some: { resourceId: filters.resourceId } } } : {}) }, include: includeResources, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] });
    return rows.map((row) => this.map(row));
  }
  async update(booking: Booking, replaceResources: boolean): Promise<Booking> {
    const row = await this.prisma.$transaction(async (transaction) => {
      await transaction.booking.update({ where: { id: booking.id }, data: { contactId: booking.contactId, checkInDate: booking.checkInDate, checkOutDate: booking.checkOutDate, adults: booking.adults, children: booking.children, notes: booking.notes } });
      if (replaceResources) {
        await transaction.bookingResource.deleteMany({ where: { bookingId: booking.id } });
        if (booking.resourceIds.length > 0) await transaction.bookingResource.createMany({ data: booking.resourceIds.map((resourceId) => ({ bookingId: booking.id, resourceId })) });
      }
      return transaction.booking.findUniqueOrThrow({ where: { id: booking.id }, include: includeResources });
    });
    return this.map(row);
  }
  async markPending(id: string, businessId: string, actorUserId: string | null): Promise<Booking | null> {
    return this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "Booking" WHERE "id" = ${id} AND "businessId" = ${businessId} FOR UPDATE`);
      const current = await transaction.booking.findFirst({ where: { id, businessId }, include: includeResources });
      if (!current || current.status !== 'DRAFT') return null;
      await this.validateSubmission(transaction, current, businessId, id);
      const updated = await transaction.booking.updateMany({ where: { id, businessId, status: BookingStatus.DRAFT }, data: { status: BookingStatus.PENDING } });
      if (updated.count !== 1) return null;
      await transaction.bookingTimelineEvent.create({ data: { businessId, bookingId: id, type: BookingTimelineEventType.BOOKING_SUBMITTED, actorUserId, details: {} } });
      return this.map(await transaction.booking.findUniqueOrThrow({ where: { id }, include: includeResources }));
    }, { maxWait: 5000, timeout: 30000 });
  }
  private async validateSubmission(transaction: Prisma.TransactionClient, current: BookingRow, businessId: string, id: string): Promise<void> {
    if (!current.contactId) throw new BookingContactRequiredError('La reserva requiere un contacto responsable.');
    if (!current.checkInDate || !current.checkOutDate) throw new BookingDatesRequiredError('La reserva requiere fechas completas.');
    if (current.resources.length !== 1) throw new BookingResourcesRequiredError('La reserva requiere exactamente un recurso.');
    for (const resource of current.resources) {
      await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${resource.resourceId}, 0))`);
    }
    const availability = await validateAvailabilityInTransaction(transaction, {
      businessId, resourceIds: current.resources.map(({ resourceId }) => resourceId),
      checkInDate: current.checkInDate.toISOString().slice(0, 10), checkOutDate: current.checkOutDate.toISOString().slice(0, 10), excludeBookingId: id,
    });
    if (!availability.valid) throw new BookingAvailabilityConflictError('La reserva tiene conflictos de disponibilidad.');
    const contact = await transaction.contact.findFirst({ where: { id: current.contactId, businessId }, select: { id: true } });
    if (!contact) throw new BookingContactNotFoundError('El contacto no existe.');
    const resource = await transaction.resource.findFirst({ where: { id: current.resources[0].resourceId, businessId }, select: { capacityMaximum: true, capacityMaximumChildren: true } });
    if (!resource) throw new BookingAvailabilityConflictError('El recurso no existe.');
    assertBookingCapacity(current.adults, current.children, resource.capacityMaximum, resource.capacityMaximumChildren);
  }
  async markCancelled(id: string, businessId: string, actorUserId: string | null, reason?: string): Promise<Booking | null> {
    return this.prisma.$transaction(async (transaction) => {
      const updated = await transaction.booking.updateMany({ where: { id, businessId, status: { in: [BookingStatus.DRAFT, BookingStatus.PENDING, BookingStatus.CONFIRMED] } }, data: { status: BookingStatus.CANCELLED } });
      if (updated.count !== 1) return null;
      await transaction.bookingTimelineEvent.create({ data: { businessId, bookingId: id, type: BookingTimelineEventType.BOOKING_CANCELLED, actorUserId, details: reason ? { reason } : {} } });
      return this.map(await transaction.booking.findUniqueOrThrow({ where: { id }, include: includeResources }));
    });
  }
  async hasBlockingBooking(
  businessId: string,
  resourceId: string,
  from: Date,
  to: Date,
  pendingBlocksAvailability = true,
  excludeBookingId?: string,
  ): Promise<boolean> {
    const booking = await this.prisma.booking.findFirst({
      where: {
        businessId,
        ...(excludeBookingId !== undefined
          ? {
              id: {
                not: excludeBookingId,
              },
            }
          : {}),
        status: {
          in: this.blockingStatuses(
            pendingBlocksAvailability,
          ),
        },
        resources: {
          some: {
            resourceId,
          },
        },
        checkInDate: {
          lt: to,
        },
        checkOutDate: {
          gt: from,
        },
      },
      select: {
        id: true,
      },
    });

    return booking !== null;
  }
  async listBlockingBookings(businessId: string, from: Date, to: Date, pendingBlocksAvailability = true): Promise<BlockingBooking[]> {
    const rows = await this.prisma.booking.findMany({
      where: {
        businessId,
        status: { in: this.blockingStatuses(pendingBlocksAvailability) },
        checkInDate: { lt: to },
        checkOutDate: { gt: from },
      },
      select: {
        checkInDate: true,
        checkOutDate: true,
        resources: { select: { resourceId: true } },
      },
    });
    return rows.flatMap((row) =>
      row.resources.map((resource) => ({
        resourceId: resource.resourceId,
        checkInDate: row.checkInDate!,
        checkOutDate: row.checkOutDate!,
      })),
    );
  }
  private blockingStatuses(pendingBlocksAvailability: boolean): BookingStatus[] { return pendingBlocksAvailability ? [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] : [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS]; }
  private map(row: BookingRow): Booking { return Booking.create({ id: row.id, businessId: row.businessId, status: row.status as BookingStatus, contactId: row.contactId, resourceIds: row.resources.map((resource) => resource.resourceId), checkInDate: row.checkInDate, checkOutDate: row.checkOutDate, adults: row.adults, children: row.children, notes: row.notes, createdAt: row.createdAt, updatedAt: row.updatedAt }); }
}
