import { Inject, Injectable } from '@nestjs/common';
import type { PrismaClient } from '@prisma/client';
import {
  AVAILABILITY_TRANSACTIONAL_VALIDATOR,
  type AvailabilityTransactionalValidator,
} from '../../availability/availability.contract';
import {
  AvailabilityBusinessNotFoundError,
  AvailabilityBusinessUnavailableError,
  AvailabilityResourceNotFoundError,
  InvalidAvailabilityInputError,
} from '../../availability/application/check-availability.use-case';
import {
  BOOKING_PENDING_PERSISTENCE,
  type BookingPendingPersistence,
} from '../../booking/booking.contract';
import {
  BookingAvailabilityConflictError,
  BookingBusinessNotFoundError,
  BookingBusinessUnavailableError,
  BookingContactNotFoundError,
  BookingResourceNotFoundError,
  BookingResourceUnavailableError,
  InvalidBookingInputError,
} from '../../booking/application/booking.errors';
import type {
  BookingPendingCreation,
  BookingPendingCreationInput,
} from '../booking-pending-creation.contract';
import type { Booking } from '../../booking/domain/booking.entity';

type TransactionClient = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0];

@Injectable()
export class PrismaBookingPendingCreationTransaction
  implements BookingPendingCreation
{
  constructor(
    @Inject(AVAILABILITY_TRANSACTIONAL_VALIDATOR)
    private readonly availability: AvailabilityTransactionalValidator,
    @Inject(BOOKING_PENDING_PERSISTENCE)
    private readonly persistence: BookingPendingPersistence,
  ) {}

  async createPendingInTransaction(
    input: BookingPendingCreationInput,
  ): Promise<Booking> {
    const transaction = input.transaction as TransactionClient;
    await this.persistence.lockResourceInTransaction(input);
    await this.assertContact(transaction, input);

    let result;
    try {
      result = await this.availability.validate({
        businessId: input.businessId,
        resourceId: input.resourceId,
        from: input.checkInDate,
        to: input.checkOutDate,
        guests: input.guests,
        transaction,
      });
    } catch (error) {
      throw mapAvailabilityError(error);
    }

    if (result.reasons.includes('RESOURCE_OUT_OF_SERVICE') || result.reasons.includes('RESOURCE_ARCHIVED')) {
      throw new BookingResourceUnavailableError('El recurso no está disponible.');
    }
    if (result.status !== 'AVAILABLE') {
      throw new BookingAvailabilityConflictError(
        'La reserva tiene conflictos de disponibilidad.',
      );
    }

    return this.persistence.createPendingInTransaction(input);
  }

  private async assertContact(
    transaction: TransactionClient,
    input: BookingPendingCreationInput,
  ): Promise<void> {
    const contact = await transaction.contact.findFirst({
      where: { id: input.contactId, businessId: input.businessId },
      select: { id: true },
    });
    if (!contact) {
      throw new BookingContactNotFoundError('El contacto no existe.');
    }
  }
}

function mapAvailabilityError(error: unknown): Error {
  if (error instanceof AvailabilityBusinessNotFoundError) {
    return new BookingBusinessNotFoundError('El negocio no existe.');
  }
  if (error instanceof AvailabilityBusinessUnavailableError) {
    return new BookingBusinessUnavailableError('El negocio no está activo.');
  }
  if (error instanceof AvailabilityResourceNotFoundError) {
    return new BookingResourceNotFoundError('El recurso no existe.');
  }
  if (error instanceof InvalidAvailabilityInputError) {
    return new InvalidBookingInputError(error.message);
  }
  return error instanceof Error ? error : new Error('No se pudo validar la disponibilidad.');
}
