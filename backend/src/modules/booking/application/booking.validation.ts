import { InvalidBookingInputError } from './booking.errors';
import { BookingStatus } from '../domain/booking-status.enum';

export const bookingUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function requireBookingUuid(value: unknown, message: string): string { if (typeof value !== 'string' || !bookingUuid.test(value)) throw new InvalidBookingInputError(message); return value; }
export function bookingDate(value: unknown, field: string): Date | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string' || !datePattern.test(value)) throw new InvalidBookingInputError(`${field} es inválida.`);
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new InvalidBookingInputError(`${field} es inválida.`);
  return parsed;
}
export function bookingCount(value: unknown, field: string): number | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new InvalidBookingInputError(`${field} es inválido.`);
  return value;
}
export function bookingNotes(value: unknown): string | null | undefined {
  if (value === undefined || value === null) return value;
  if (typeof value !== 'string') throw new InvalidBookingInputError('Las notas son inválidas.');
  const normalized = value.trim();
  if (normalized.length > 1000) throw new InvalidBookingInputError('Las notas son inválidas.');
  return normalized || null;
}
export function bookingResourceIds(value: unknown): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new InvalidBookingInputError('Los recursos son inválidos.');
  const ids = value.map((id) => requireBookingUuid(id, 'El identificador del recurso no es válido.'));
  if (new Set(ids).size !== ids.length) throw new InvalidBookingInputError('Los recursos no pueden repetirse.');
  return ids;
}
export function bookingContactId(value: unknown): string | null | undefined { if (value === undefined || value === null) return value; return requireBookingUuid(value, 'El identificador del contacto no es válido.'); }
export function requireBookingPatch(input: object): void { if (!['contactId', 'resourceIds', 'checkInDate', 'checkOutDate', 'adults', 'children', 'notes'].some((key) => Object.prototype.hasOwnProperty.call(input, key))) throw new InvalidBookingInputError('Se requiere al menos un campo para actualizar.'); }
export function bookingStatus(value: unknown): BookingStatus | null { if (value === undefined) return null; if (typeof value !== 'string' || !Object.values(BookingStatus).includes(value as BookingStatus)) throw new InvalidBookingInputError('El estado de la reserva no es válido.'); return value as BookingStatus; }
export function assertDateRange(checkInDate: Date | null, checkOutDate: Date | null): void { if (checkInDate && checkOutDate && checkOutDate <= checkInDate) throw new InvalidBookingInputError('La fecha de salida debe ser posterior a la fecha de entrada.'); }
