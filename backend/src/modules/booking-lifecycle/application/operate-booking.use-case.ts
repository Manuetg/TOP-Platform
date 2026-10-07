import { Inject, Injectable } from '@nestjs/common';
import { InvalidBookingInputError, requireBookingUuid, type Booking } from '../../booking/booking.contract';
import { BOOKING_OPERATION_TRANSACTION, BookingOperation, type BookingOperationTransaction } from '../booking-operation.contract';

export interface OperateBookingInput {
  businessId: unknown;
  bookingId: unknown;
  actorUserId: unknown;
  operation: BookingOperation;
  expectedUpdatedAt: unknown;
  reason?: unknown;
}

@Injectable()
export class OperateBookingUseCase {
  constructor(@Inject(BOOKING_OPERATION_TRANSACTION) private readonly transaction: BookingOperationTransaction) {}

  execute(input: OperateBookingInput): Promise<Booking> {
    if (!Object.values(BookingOperation).includes(input.operation)) throw new InvalidBookingInputError('La acción de reserva no es válida.');
    return this.transaction.execute({
      businessId: requireBookingUuid(input.businessId, 'El identificador del negocio no es válido.'),
      bookingId: requireBookingUuid(input.bookingId, 'El identificador de la reserva no es válido.'),
      actorUserId: requireBookingUuid(input.actorUserId, 'El identificador del actor no es válido.'),
      operation: input.operation,
      expectedUpdatedAt: operationVersion(input.expectedUpdatedAt),
      reason: operationReason(input.reason),
    });
  }
}

function operationVersion(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) throw new InvalidBookingInputError('La versión debe ser una fecha UTC exacta con milisegundos.');
  const version = new Date(value);
  if (Number.isNaN(version.valueOf()) || version.toISOString() !== value) throw new InvalidBookingInputError('La versión de la reserva no es válida.');
  return version;
}

function operationReason(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') throw new InvalidBookingInputError('El motivo debe ser texto.');
  const reason = value.trim();
  if (reason.length < 2 || reason.length > 500) throw new InvalidBookingInputError('El motivo debe tener entre 2 y 500 caracteres.');
  return reason;
}
