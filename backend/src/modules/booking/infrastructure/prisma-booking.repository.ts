import { Injectable } from '@nestjs/common';
import type { Booking as PrismaBooking, BookingResource } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import type { BookingData, BookingListFilters, BookingRepository } from '../domain/booking.repository';
import type { BlockingBooking } from '../booking.contract';
import { BookingTimelineEventType } from '../domain/booking-timeline-event';

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
      const updated = await transaction.booking.updateMany({ where: { id, businessId, status: BookingStatus.DRAFT }, data: { status: BookingStatus.PENDING } });
      if (updated.count !== 1) return null;
      await transaction.bookingTimelineEvent.create({ data: { businessId, bookingId: id, type: BookingTimelineEventType.BOOKING_SUBMITTED, actorUserId, details: {} } });
      return this.map(await transaction.booking.findUniqueOrThrow({ where: { id }, include: includeResources }));
    });
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
