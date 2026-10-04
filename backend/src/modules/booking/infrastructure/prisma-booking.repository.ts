import { Inject, Injectable } from '@nestjs/common';
import { Prisma, type Booking as PrismaBooking, type BookingResource } from '@prisma/client';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { createIntegrationEvent, IntegrationEventType } from '../../../shared/integration-events/integration-event';
import { INTEGRATION_EVENT_OUTBOX, type IntegrationEventOutbox } from '../../../shared/integration-events/integration-event.outbox';
import { PrismaIntegrationEventOutbox } from '../../../shared/infrastructure/prisma-integration-event.outbox';
import { Booking } from '../domain/booking.entity';
import { BookingStatus } from '../domain/booking-status.enum';
import type { BookingData, BookingListFilters, BookingRepository } from '../domain/booking.repository';
import type { BlockingBooking, BookingPendingPersistence, BookingPendingPersistenceInput } from '../booking.contract';
import { BookingTimelineEventType } from '../domain/booking-timeline-event';

type BookingRow = PrismaBooking & { resources: BookingResource[] };
const includeResources = { resources: { orderBy: { resourceId: 'asc' as const } } };

@Injectable()
export class PrismaBookingRepository implements BookingRepository, BookingPendingPersistence {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(INTEGRATION_EVENT_OUTBOX)
    private readonly outbox: IntegrationEventOutbox = new PrismaIntegrationEventOutbox(),
  ) {}
  async create(data: BookingData): Promise<Booking> {
    const row = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.booking.create({ data: { businessId: data.businessId, status: 'DRAFT', contactId: data.contactId, checkInDate: data.checkInDate, checkOutDate: data.checkOutDate, adults: data.adults, children: data.children, notes: data.notes, resources: { create: data.resourceIds.map((resourceId) => ({ resourceId })) } }, include: includeResources });
      await transaction.bookingTimelineEvent.create({ data: { businessId: data.businessId, bookingId: created.id, type: BookingTimelineEventType.BOOKING_CREATED, actorUserId: data.actorUserId ?? null, details: {} } });
      await this.outbox.append(transaction, createIntegrationEvent({
        eventType: IntegrationEventType.BOOKING_CREATED,
        businessId: data.businessId,
        aggregateType: 'BOOKING',
        aggregateId: created.id,
        payload: { bookingId: created.id, status: 'DRAFT' },
      }));
      return created;
    });
    return this.map(row);
  }
  async lockResourceInTransaction(input: { businessId: string; resourceId: string; transaction: unknown }): Promise<void> {
    const transaction = input.transaction as Prisma.TransactionClient;
    await transaction.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.businessId}|${input.resourceId}`}, 0))`);
  }

  async createPendingInTransaction(input: BookingPendingPersistenceInput): Promise<Booking> {
    const transaction = input.transaction as Prisma.TransactionClient;
    const created = await transaction.booking.create({ data: { businessId: input.businessId, status: BookingStatus.PENDING, contactId: input.contactId, checkInDate: new Date(`${input.checkInDate}T00:00:00.000Z`), checkOutDate: new Date(`${input.checkOutDate}T00:00:00.000Z`), adults: input.guests, children: 0, notes: null, resources: { create: [{ resourceId: input.resourceId }] } }, include: includeResources });
    await transaction.bookingTimelineEvent.createMany({ data: [{ businessId: input.businessId, bookingId: created.id, type: BookingTimelineEventType.BOOKING_CREATED, actorUserId: input.actorUserId, details: {} }, { businessId: input.businessId, bookingId: created.id, type: BookingTimelineEventType.BOOKING_SUBMITTED, actorUserId: input.actorUserId, details: {} }] });
    await this.outbox.append(transaction, createIntegrationEvent({ eventType: IntegrationEventType.BOOKING_CREATED, businessId: input.businessId, aggregateType: 'BOOKING', aggregateId: created.id, payload: { bookingId: created.id, status: BookingStatus.PENDING } }));
    return this.map(created);
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
      await this.outbox.append(transaction, createIntegrationEvent({
        eventType: IntegrationEventType.BOOKING_CANCELLED,
        businessId,
        aggregateType: 'BOOKING',
        aggregateId: id,
        payload: { bookingId: id, status: 'CANCELLED', ...(reason ? { reason } : {}) },
      }));
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
    transaction?: unknown,
  ): Promise<boolean> {
    const client = transaction as Prisma.TransactionClient | undefined ?? this.prisma;
    const booking = await client.booking.findFirst({
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
  async listBlockingBookings(businessId: string, from: Date, to: Date, pendingBlocksAvailability = true, transaction?: unknown): Promise<BlockingBooking[]> {
    const client = transaction as Prisma.TransactionClient | undefined ?? this.prisma;
    const rows = await client.booking.findMany({
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
