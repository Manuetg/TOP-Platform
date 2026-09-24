import { contactFields } from './contact.validation';
import { contactPhoneCountry, normalizeContactPhone } from './contact-phone';
import { InvalidContactInputError } from './contact.errors';

describe('Contact phone normalization', () => {
  it.each([
    ['0981 123 456', 'Paraguay', '+595981123456'],
    ['11 2345 6789', 'Argentina', '+541123456789'],
    ['(11) 91234-5678', 'Brasil', '+5511912345678'],
    ['+54 11 2345 6789', 'Paraguay', '+541123456789'],
    ['00595 981 123456', null, '+595981123456'],
  ])('normalizes %s with %s without duplicating its prefix', (value, country, expected) => {
    expect(normalizeContactPhone(value, country)).toBe(expected);
  });
  it.each(['123', '+000123456789', '+595981123456 ext 2', 'llamar 0981123456', '+595981123456+1'])('rejects invalid or ambiguous changed numbers', (value) => {
    expect(() => normalizeContactPhone(value, 'Paraguay')).toThrow(InvalidContactInputError);
  });
  it('preserves unspecified historical numbers, even after country changes', () => {
    const previous = { name: 'Ana', lastName: null, phone: 'interno histórico', whatsapp: '0999999', email: null, documentType: null, documentNumber: null, country: 'Paraguay', city: null };
    expect(contactFields({ country: 'Argentina', phone: previous.phone }, previous)).toMatchObject({ phone: previous.phone, whatsapp: previous.whatsapp, country: 'Argentina' });
    expect(contactFields({ phone: '+595981123456', whatsapp: '+595981123456' }, previous)).toMatchObject({ phone: '+595981123456', whatsapp: '+595981123456' });
  });
  it('keeps the country-less legacy contract without guessing a prefix', () => {
    expect(normalizeContactPhone('0981123456', null)).toBe('0981123456');
    expect(normalizeContactPhone(null, 'Paraguay')).toBeNull();
    expect(contactPhoneCountry('PY')).toBe('PY');
    expect(contactPhoneCountry('República Checa')).toBe('CZ');
    expect(contactPhoneCountry('desconocido')).toBeUndefined();
  });
});
