import { InvalidBlockInputError } from './block.errors';
import { dateTime, text, uuid } from './block.validation';

const validUuid = '11111111-1111-4111-8111-111111111111';

describe('Block validation', () => {
  it.each([
    ['reason', 'ab', 2, 120, false],
    ['reason', 'a'.repeat(120), 2, 120, false],
    ['notes', 'a'.repeat(500), 0, 500, true],
  ])('accepts the exact approved boundaries for %s', (_field, value, minimum, maximum, nullable) => {
    expect(text(value, 'El campo', minimum, maximum, nullable)).toBe(value);
  });

  it.each([
    ['reason', 'a', 2, 120, false],
    ['reason', 'a'.repeat(121), 2, 120, false],
    ['notes', 'a'.repeat(501), 0, 500, true],
    ['reason', 2, 2, 120, false],
  ])('rejects invalid text values for %s', (_field, value, minimum, maximum, nullable) => {
    expect(() => text(value, 'El campo', minimum, maximum, nullable)).toThrow(InvalidBlockInputError);
  });

  it.each([`prefix${validUuid}`, `${validUuid}suffix`])('rejects UUIDs with extra text', (value) => {
    expect(() => uuid(value, 'UUID inválido.')).toThrow('UUID inválido.');
  });

  it.each([
    '2026-12-20T10:00:00Z',
    '2026-12-20T10:00:00.1-03:00',
    '2026-12-20T10:00:00.12-03:00',
    '2026-12-20T10:00:00.123-03:00',
  ])('accepts RFC3339 instants with approved fractional precision', (value) => {
    expect(dateTime(value, 'El inicio')).toBeInstanceOf(Date);
  });

  it.each([
    'prefix2026-12-20T10:00:00Z',
    '2026-12-20T10:00:00Zsuffix',
    '2026-12-20T10:00:00.1234Z',
    '2026-12-20T10:00:00.Z',
    '2026-12-20T10:00:00',
    123,
  ])('rejects malformed or non-string RFC3339 instants', (value) => {
    expect(() => dateTime(value, 'El inicio')).toThrow(InvalidBlockInputError);
  });
});
