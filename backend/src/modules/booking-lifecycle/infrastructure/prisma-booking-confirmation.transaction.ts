import { Injectable } from '@nestjs/common';
import {
  Prisma,
  type PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import type {
  BookingConfirmationTransaction,
  BookingConfirmationTransactionInput,
  BookingConfirmationTransactionResult,
} from '../booking-confirmation.contract';

type TransactionClient = Parameters<
  Parameters<PrismaClient['$transaction']>[0]
>[0];

@Injectable()
export class PrismaBookingConfirmationTransaction
  implements BookingConfirmationTransaction
{
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  async confirm(
    input: BookingConfirmationTransactionInput,
  ): Promise<BookingConfirmationTransactionResult> {
    return this.prisma.$transaction(
      async (transaction) =>
        this.confirmInsideTransaction(
          transaction,
          input,
        ),
      {
        maxWait: 5_000,
        timeout: 30_000,
      },
    );
  }

  private async confirmInsideTransaction(
    transaction: TransactionClient,
    input: BookingConfirmationTransactionInput,
  ): Promise<BookingConfirmationTransactionResult> {
    await this.lockBooking(
      transaction,
      input.businessId,
      input.bookingId,
    );

    const booking =
      await transaction.booking.findFirst({
        where: {
          id: input.bookingId,
          businessId: input.businessId,
        },
        select: {
          id: true,
          status: true,
          resources: {
            select: {
              resourceId: true,
            },
            orderBy: {
              resourceId: 'asc',
            },
          },
        },
      });

    if (!booking) {
      return 'NOT_FOUND';
    }

    if (booking.status !== 'PENDING') {
      return 'NOT_PENDING';
    }

    for (const resource of booking.resources) {
      await this.lockResource(
        transaction,
        resource.resourceId,
      );
    }

    const snapshot = await input.prepare();

    await transaction.pricingSnapshot.create({
      data: {
        businessId: input.businessId,
        bookingId: input.bookingId,
        currency: snapshot.currency,
        totalAmountMinor:
          snapshot.totalAmountMinor,
        items:
          snapshot.items as Prisma.InputJsonValue,
      },
    });

    const updated =
      await transaction.booking.updateMany({
        where: {
          id: input.bookingId,
          businessId: input.businessId,
          status: 'PENDING',
        },
        data: {
          status: 'CONFIRMED',
        },
      });

    if (updated.count !== 1) {
      throw new Error(
        'La reserva cambió de estado durante la confirmación.',
      );
    }

    return 'CONFIRMED';
  }

  private async lockBooking(
    transaction: TransactionClient,
    businessId: string,
    bookingId: string,
  ): Promise<void> {
    await transaction.$queryRaw(
      Prisma.sql`
        SELECT "id"
        FROM "Booking"
        WHERE "id" = ${bookingId}
          AND "businessId" = ${businessId}
        FOR UPDATE
      `,
    );
  }

  private async lockResource(
    transaction: TransactionClient,
    resourceId: string,
  ): Promise<void> {
    await transaction.$executeRaw(
      Prisma.sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${resourceId}, 0)
        )
      `,
    );
  }
}
