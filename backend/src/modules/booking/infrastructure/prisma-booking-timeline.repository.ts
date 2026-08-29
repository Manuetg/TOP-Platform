import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/infrastructure/prisma.service';
import { BookingTimelineEventType, type BookingTimelineEvent, type BookingTimelineRepository } from '../domain/booking-timeline-event';

@Injectable()
export class PrismaBookingTimelineRepository implements BookingTimelineRepository {
  constructor(private readonly prisma: PrismaService) {}
  async append(event: Omit<BookingTimelineEvent,'id'>): Promise<BookingTimelineEvent> {
    const row = await this.prisma.bookingTimelineEvent.create({ data: { businessId:event.businessId, bookingId:event.bookingId, type:event.type, occurredAt:event.occurredAt, actorUserId:event.actorUserId, details:event.details } });
    return this.map(row);
  }
  async list(input:{businessId:string; bookingId:string; cursor?:string; limit:number}): Promise<{items:BookingTimelineEvent[]; nextCursor:string|null}> {
    const rows = await this.prisma.bookingTimelineEvent.findMany({ where:{businessId:input.businessId, bookingId:input.bookingId}, orderBy:[{occurredAt:'desc'},{id:'desc'}], take:input.limit+1, ...(input.cursor ? { skip:1, cursor:{id:input.cursor} } : {}) });
    const hasNext = rows.length > input.limit; const items = rows.slice(0,input.limit).map((row)=>this.map(row));
    return { items, nextCursor: hasNext ? items.at(-1)?.id ?? null : null };
  }
  private map(row:any): BookingTimelineEvent { return { id:row.id, businessId:row.businessId, bookingId:row.bookingId, type:row.type as BookingTimelineEventType, occurredAt:row.occurredAt, actorUserId:row.actorUserId, details:row.details as Record<string,unknown> }; }
}
