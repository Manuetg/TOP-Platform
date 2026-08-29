import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { BookingTimelineEventType, type BookingTimelineEvent, type BookingTimelineRepository } from '../domain/booking-timeline-event';

@Injectable()
export class PrismaBookingTimelineRepository implements BookingTimelineRepository {
  constructor(private readonly prisma: PrismaService) {}
  async list(input: Parameters<BookingTimelineRepository['list']>[0]): Promise<BookingTimelineEvent[]> {
    const before = input.before;
    const rows = await this.prisma.bookingTimelineEvent.findMany({
      where: {
        businessId: input.businessId,
        bookingId: input.bookingId,
        ...(before ? { OR: [{ occurredAt: { lt: before.occurredAt } }, { occurredAt: before.occurredAt, id: { lt: before.id } }] } : {}),
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: input.limit,
      select: { id:true, businessId:true, bookingId:true, type:true, occurredAt:true, actorUserId:true, details:true },
    });
    return rows.map((row)=>this.map(row));
  }
  private map(row:{id:string;businessId:string;bookingId:string;type:string;occurredAt:Date;actorUserId:string|null;details:unknown}): BookingTimelineEvent { return { id:row.id, businessId:row.businessId, bookingId:row.bookingId, type:row.type as BookingTimelineEventType, occurredAt:row.occurredAt, actorUserId:row.actorUserId, details:row.details as {reason?:string} }; }
}
