import { InvalidContactInputError } from './contact.errors';

export const contactUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export interface ContactFields { name: string; lastName: string | null; phone: string | null; whatsapp: string | null; email: string | null; documentType: string | null; documentNumber: string | null; country: string | null; city: string | null; }
export type ContactFieldInput = { [K in keyof ContactFields]?: unknown };
const optionalText = (value: unknown, field: string): string | null => { if (value === undefined || value === null) return null; if (typeof value !== 'string') throw new InvalidContactInputError(`${field} es inválido.`); const trimmed = value.trim(); if (trimmed.length === 0 || trimmed.length > 120) throw new InvalidContactInputError(`${field} es inválido.`); return trimmed; };
const valueOrCurrent = (value: unknown, current: string | null, field: string): string | null => value === undefined ? current : optionalText(value, field);
const emptyFields: ContactFields = { name: '', lastName: null, phone: null, whatsapp: null, email: null, documentType: null, documentNumber: null, country: null, city: null };
export function contactFields(input: ContactFieldInput, current?: ContactFields): ContactFields {
  const previous = current ?? emptyFields;
  const candidateName = valueOrCurrent(input.name, previous.name, 'El nombre');
  if (typeof candidateName !== 'string' || candidateName.length < 2) throw new InvalidContactInputError('El nombre es obligatorio.');
  const name = candidateName;
  const fields: ContactFields = { name, lastName: valueOrCurrent(input.lastName, previous.lastName, 'El apellido'), phone: valueOrCurrent(input.phone, previous.phone, 'El teléfono'), whatsapp: valueOrCurrent(input.whatsapp, previous.whatsapp, 'El WhatsApp'), email: valueOrCurrent(input.email, previous.email, 'El email'), documentType: valueOrCurrent(input.documentType, previous.documentType, 'El tipo de documento'), documentNumber: valueOrCurrent(input.documentNumber, previous.documentNumber, 'El número de documento'), country: valueOrCurrent(input.country, previous.country, 'El país'), city: valueOrCurrent(input.city, previous.city, 'La ciudad') };
  if (fields.email !== null && !email.test(fields.email)) throw new InvalidContactInputError('El email es inválido.');
  if (fields.phone === null && fields.whatsapp === null && fields.email === null) throw new InvalidContactInputError('Se requiere al menos un medio de contacto válido.');
  return fields;
}
