import { Business } from './business.entity';
import { BusinessStatus } from './business-status.enum';

describe('Business', () => {
  it('expone cada propiedad de dominio sin alterar sus valores', () => {
    const createdAt = new Date('2026-01-02T03:04:05.000Z');
    const updatedAt = new Date('2026-06-07T08:09:10.000Z');
    const business = Business.create({
      id: 'a2c49800-e50e-4d0e-b82b-0b51c09a1234',
      businessNumber: 42,
      name: 'Posada Las Palmeras',
      legalName: 'Las Palmeras S.A.',
      taxId: '80076543-2',
      timezone: 'America/Asuncion',
      currency: 'PYG',
      status: BusinessStatus.SUSPENDED,
      createdAt,
      updatedAt,
    });

    expect(business.id).toBe('a2c49800-e50e-4d0e-b82b-0b51c09a1234');
    expect(business.businessNumber).toBe(42);
    expect(business.name).toBe('Posada Las Palmeras');
    expect(business.legalName).toBe('Las Palmeras S.A.');
    expect(business.taxId).toBe('80076543-2');
    expect(business.timezone).toBe('America/Asuncion');
    expect(business.currency).toBe('PYG');
    expect(business.status).toBe(BusinessStatus.SUSPENDED);
    expect(business.createdAt).toBe(createdAt);
    expect(business.updatedAt).toBe(updatedAt);
  });
});
