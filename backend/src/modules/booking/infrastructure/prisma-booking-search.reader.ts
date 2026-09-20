import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../business/business.contract';
import { BookingStatus } from '../domain/booking-status.enum';
import type { BookingSearchReader, BookingSearchMatch } from '../application/booking-search.reader';

@Injectable()
export class PrismaBookingSearchReader implements BookingSearchReader {
  constructor(private readonly prisma: PrismaService) {}
  async read(businessId: string, query: string): Promise<BookingSearchMatch[]> {
    const row = await this.prisma.booking.findFirst({
      where: { businessId, id: query },
      select: { id: true, checkInDate: true, checkOutDate: true, status: true },
    });
    if (!row) return [];
    const dates = [row.checkInDate, row.checkOutDate].map((date) => date?.toISOString().slice(0, 10)).filter(Boolean);
    return [{ id: row.id, title: `Reserva ${row.id}`, subtitle: dates.join(' → ') || null, status: row.status as BookingStatus }];
  }
}
