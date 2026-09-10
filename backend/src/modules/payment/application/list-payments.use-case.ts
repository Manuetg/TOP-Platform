import { Inject, Injectable } from '@nestjs/common';
import { type BookingRepository, requireBookingUuid } from '../../booking/booking.contract';
import {
  PAYMENT_REPOSITORY,
  type PaymentCursor,
  type PaymentRepository,
  type PublicPayment,
} from '../domain/payment';

export class PaymentHistoryInputError extends Error {}
export class PaymentHistoryNotFoundError extends Error {}

export interface PaymentHistoryPage {
  items: PublicPayment[];
  pageInfo: { nextCursor: string | null; hasNextPage: boolean };
}

@Injectable()
export class ListPaymentsUseCase {
  constructor(
    @Inject(PAYMENT_REPOSITORY) private readonly payments: PaymentRepository,
    @Inject('PAYMENT_BOOKING_LOOKUP') private readonly bookings: BookingRepository,
  ) {}

  async execute(input: {
    businessId: unknown;
    bookingId: unknown;
    cursor?: unknown;
    limit?: unknown;
  }): Promise<PaymentHistoryPage> {
    const businessId = this.uuid(input.businessId, 'negocio');
    const bookingId = this.uuid(input.bookingId, 'reserva');
    if (!(await this.bookings.findByIdAndBusinessId(bookingId, businessId))) {
      throw new PaymentHistoryNotFoundError('La reserva no existe.');
    }
    const limit = this.parseLimit(input.limit);
    const rows = await this.payments.listByBooking({
      businessId,
      bookingId,
      before: this.parseCursor(input.cursor),
      limit: limit + 1,
    });
    const hasNextPage = rows.length > limit;
    const items = rows.slice(0, limit);
    const last = items.at(-1);
    return {
      items,
      pageInfo: {
        hasNextPage,
        nextCursor: hasNextPage && last ? this.encodeCursor(last) : null,
      },
    };
  }

  private uuid(value: unknown, label: string): string {
    try {
      return requireBookingUuid(value, `El identificador de ${label} no es válido.`);
    } catch {
      throw new PaymentHistoryInputError(`El identificador de ${label} no es válido.`);
    }
  }

  private parseLimit(value: unknown): number {
    if (value === undefined) return 50;
    const parsed = typeof value === 'string' ? Number(value) : value;
    if (!Number.isInteger(parsed) || Number(parsed) < 1 || Number(parsed) > 50) {
      throw new PaymentHistoryInputError('El límite debe ser un entero entre 1 y 50.');
    }
    return Number(parsed);
  }

  private parseCursor(value: unknown): PaymentCursor | null {
    if (value === undefined) return null;
    if (typeof value !== 'string' || value.length === 0) this.invalidCursor();
    try {
      const buffer = Buffer.from(value, 'base64url');
      if (buffer.toString('base64url') !== value) this.invalidCursor();
      const decoded = JSON.parse(buffer.toString('utf8')) as Record<string, unknown>;
      if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) this.invalidCursor();
      const keys = Object.keys(decoded).sort();
      if (keys.join(',') !== 'createdAt,id,paidAt') this.invalidCursor();
      return {
        paidAt: this.cursorDate(decoded.paidAt),
        createdAt: this.cursorDate(decoded.createdAt),
        id: this.uuid(decoded.id, 'cursor'),
      };
    } catch (error: unknown) {
      if (error instanceof PaymentHistoryInputError) throw error;
      this.invalidCursor();
    }
  }

  private cursorDate(value: unknown): Date {
    if (typeof value !== 'string') this.invalidCursor();
    const date = new Date(value);
    if (Number.isNaN(date.getTime()) || date.toISOString() !== value) this.invalidCursor();
    return date;
  }

  private invalidCursor(): never {
    throw new PaymentHistoryInputError('El cursor no es válido.');
  }

  private encodeCursor(payment: PublicPayment): string {
    return Buffer.from(JSON.stringify({
      paidAt: payment.paidAt.toISOString(),
      createdAt: payment.createdAt.toISOString(),
      id: payment.id,
    }), 'utf8').toString('base64url');
  }
}
