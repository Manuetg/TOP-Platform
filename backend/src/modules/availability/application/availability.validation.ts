import { InvalidAvailabilityInputError } from './check-availability.use-case';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function assertAvailabilityUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new InvalidAvailabilityInputError('El identificador no es válido.');
  }
}

export function parseAvailabilityDate(value: string, name: string): Date {
  if (!DATE_PATTERN.test(value)) {
    throw new InvalidAvailabilityInputError(`${name} es inválida.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new InvalidAvailabilityInputError(`${name} es inválida.`);
  }

  return parsed;
}

export function formatAvailabilityDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}
