import { InvalidManualPriceOverrideInputError } from './manual-price-override.errors';

export function manualAgreedAmount(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new InvalidManualPriceOverrideInputError('El importe acordado debe ser un entero seguro no negativo.');
  }
  return value;
}

export function manualPriceReason(value: unknown): string {
  if (typeof value !== 'string') {
    throw new InvalidManualPriceOverrideInputError('El motivo del precio personalizado es obligatorio.');
  }
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 500) {
    throw new InvalidManualPriceOverrideInputError('El motivo del precio personalizado debe tener entre 2 y 500 caracteres.');
  }
  return trimmed;
}
