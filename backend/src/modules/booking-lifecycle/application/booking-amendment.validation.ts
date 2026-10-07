import { assertDateRange, bookingCount, bookingDate, bookingNotes, InvalidBookingInputError, requireBookingUuid } from '../../booking/booking.contract';
import type { AmendmentChanges, AmendmentExpectation, AmendmentQuote } from '../booking-amendment.contract';

export interface BookingAmendmentInput {
  businessId: string;
  bookingId: string;
  actorUserId: string;
  contactId?: unknown;
  checkInDate?: unknown;
  checkOutDate?: unknown;
  adults?: unknown;
  children?: unknown;
  notes?: unknown;
  pricing?: unknown;
  reason?: unknown;
  expectedUpdatedAt?: unknown;
  currentPricingId?: unknown;
  expectedPaidAmountMinor?: unknown;
  expectedFinancialVersion?: unknown;
  acceptedQuote?: unknown;
}

export function amendmentChanges(input: BookingAmendmentInput): AmendmentChanges {
  const dates = amendmentDates(input);
  return {
    ...dates,
    ...(input.contactId === undefined ? {} : { contactId: requireBookingUuid(input.contactId, 'La reserva requiere un contacto responsable válido.') }),
    ...(input.adults === undefined ? {} : { adults: bookingCount(input.adults, 'La cantidad de adultos') }),
    ...(input.children === undefined ? {} : { children: bookingCount(input.children, 'La cantidad de niños') }),
    ...(input.notes === undefined ? {} : { notes: bookingNotes(input.notes) }),
    ...(input.pricing === undefined ? {} : { pricing: input.pricing }),
    reason: amendmentReason(input.reason),
  };
}

function amendmentDates(input: BookingAmendmentInput): Pick<AmendmentChanges, 'checkInDate' | 'checkOutDate'> {
  const dates: Pick<AmendmentChanges, 'checkInDate' | 'checkOutDate'> = {};
  for (const field of ['checkInDate', 'checkOutDate'] as const) {
    if (input[field] === undefined) continue;
    const date = bookingDate(input[field], field === 'checkInDate' ? 'La fecha de entrada' : 'La fecha de salida');
    if (!date) throw new InvalidBookingInputError('La reserva requiere fechas completas.');
    dates[field] = date;
  }
  if (dates.checkInDate && dates.checkOutDate) assertDateRange(dates.checkInDate, dates.checkOutDate);
  return dates;
}

function amendmentReason(value: unknown): string | null {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.trim().length < 2 || value.trim().length > 500) throw new InvalidBookingInputError('El motivo debe contener entre 2 y 500 caracteres.');
  return value.trim();
}

export function amendmentExpectation(input: BookingAmendmentInput): AmendmentExpectation {
  const expectedUpdatedAt = input.expectedUpdatedAt;
  if (typeof expectedUpdatedAt !== 'string' || Number.isNaN(Date.parse(expectedUpdatedAt)) || new Date(expectedUpdatedAt).toISOString() !== expectedUpdatedAt) throw new InvalidBookingInputError('Se requiere la versión exacta de la reserva en formato ISO UTC.');
  const currentPricingId = requireBookingUuid(input.currentPricingId, 'Se requiere el precio vigente observado en el preview.');
  if (typeof input.expectedPaidAmountMinor !== 'number' || !Number.isSafeInteger(input.expectedPaidAmountMinor) || input.expectedPaidAmountMinor < 0) throw new InvalidBookingInputError('El cobrado esperado debe ser un entero seguro no negativo.');
  return { expectedUpdatedAt, currentPricingId, expectedPaidAmountMinor: input.expectedPaidAmountMinor, expectedFinancialVersion: expectedFinancialVersion(input.expectedFinancialVersion), acceptedQuote: acceptedAmendmentQuote(input.acceptedQuote) };
}

function expectedFinancialVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new InvalidBookingInputError('Se requiere la versión financiera exacta observada en el preview.');
  return value;
}

function acceptedAmendmentQuote(value: unknown): AmendmentQuote {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidBookingInputError('Se requiere aceptar el precio mostrado en el preview.');
  const quote = value as Record<string, unknown>;
  requireAcceptedAmounts(quote);
  if (!Array.isArray(quote.items) || typeof quote.fingerprint !== 'string' || !/^[a-f0-9]{64}$/.test(quote.fingerprint)) throw new InvalidBookingInputError('El precio aceptado no es válido.');
  return quote as unknown as AmendmentQuote;
}

function requireAcceptedAmounts(quote: Record<string, unknown>): void {
  if (typeof quote.currency !== 'string' || typeof quote.totalAmountMinor !== 'number' || !Number.isSafeInteger(quote.totalAmountMinor) || quote.totalAmountMinor < 0) throw new InvalidBookingInputError('El precio aceptado no es válido.');
}
