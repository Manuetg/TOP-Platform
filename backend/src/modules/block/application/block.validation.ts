import { InvalidBlockInputError } from './block.errors';
import { BlockType } from '../domain/block-type.enum';

export const blockUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const rfc3339Offset = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/;

export function uuid(value: string, message: string): void { if (!blockUuid.test(value)) throw new InvalidBlockInputError(message); }
export function text(value: unknown, field: string, minimum: number, maximum: number, nullable = false): string | null {
  if (nullable && (value === undefined || value === null)) return null;
  if (typeof value !== 'string') throw new InvalidBlockInputError(`${field} es inválido.`);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) throw new InvalidBlockInputError(`${field} es inválido.`);
  return normalized;
}
export function dateTime(value: unknown, field: string): Date {
  if (typeof value !== 'string' || !rfc3339Offset.test(value)) throw new InvalidBlockInputError(`${field} es inválido.`);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) throw new InvalidBlockInputError(`${field} es inválido.`);
  return parsed;
}
export function blockType(value: unknown): BlockType {
  if (!Object.values(BlockType).includes(value as BlockType)) throw new InvalidBlockInputError('El tipo de bloqueo es inválido.');
  return value as BlockType;
}
