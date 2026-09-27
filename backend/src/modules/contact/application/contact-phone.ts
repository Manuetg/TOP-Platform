import { getCountries, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/min';
import { InvalidContactInputError } from './contact.errors';

const labels = new Intl.DisplayNames(['es'], { type: 'region' });
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const countries = new Map(getCountries().flatMap((country) => [[key(country), country], [key(labels.of(country) ?? country), country]]));
// Alias del catálogo español histórico; los prefijos provienen de metadatos, no de esta tabla.
const aliases: Record<string, CountryCode> = { 'republica checa': 'CZ', 'turquia': 'TR', 'vaticano': 'VA', 'republica del congo': 'CG', 'republica democratica del congo': 'CD', 'timor oriental': 'TL' };
export function contactPhoneCountry(value: string | null): CountryCode | undefined {
  return value ? countries.get(key(value)) ?? aliases[key(value)] : undefined;
}

export function normalizeContactPhone(value: string | null, country: string | null): string | null {
  if (value === null) return null;
  if (!/^\+?[\d\s().-]+$/.test(value)) throw new InvalidContactInputError('El teléfono debe contener un número sin extensiones.');
  const region = contactPhoneCountry(country);
  // Compatibilidad del contrato previo: sin país no se adivina el prefijo nacional.
  if (!region && !value.startsWith('+') && !value.startsWith('00') && /^\d{6,15}$/.test(value.replace(/[\s().-]/g, ''))) return value;
  const phone = parsePhoneNumberFromString(value.startsWith('00') ? `+${value.slice(2)}` : value, region);
  if (!phone || !phone.isPossible()) throw new InvalidContactInputError('Ingresa un teléfono válido con país o prefijo internacional.');
  return phone.number;
}
