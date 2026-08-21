import { Contact } from './contact.entity';
import { ContactStatus } from './contact-status.enum';

const createdAt = new Date('2026-01-01T00:00:00.000Z');
const updatedAt = new Date('2026-01-02T00:00:00.000Z');

describe('Contact', () => {
  it('exposes its public fields and builds the full name without null fragments', () => {
    const contact = Contact.create({
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      name: 'María',
      lastName: null,
      phone: '0981123456',
      whatsapp: null,
      email: 'maria@example.com',
      documentType: null,
      documentNumber: null,
      country: 'Paraguay',
      city: 'Asunción',
      status: ContactStatus.ACTIVE,
      createdAt,
      updatedAt,
    });

    expect(contact).toMatchObject({
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      name: 'María',
      lastName: null,
      phone: '0981123456',
      email: 'maria@example.com',
      country: 'Paraguay',
      city: 'Asunción',
      status: ContactStatus.ACTIVE,
      createdAt,
      updatedAt,
      fullName: 'María',
    });
  });

  it('updates immutably while preserving fields outside the requested change', () => {
    const original = Contact.create({
      id: '11111111-1111-4111-8111-111111111111',
      businessId: '22222222-2222-4222-8222-222222222222',
      name: 'María',
      lastName: 'López',
      phone: '0981123456',
      whatsapp: null,
      email: null,
      documentType: 'CI',
      documentNumber: '123',
      country: 'Paraguay',
      city: 'Asunción',
      status: ContactStatus.ACTIVE,
      createdAt,
      updatedAt,
    });

    const updated = original.update({ city: 'Encarnación' });

    expect(updated).not.toBe(original);
    expect(original.city).toBe('Asunción');
    expect(updated).toMatchObject({
      id: original.id,
      businessId: original.businessId,
      name: 'María',
      lastName: 'López',
      phone: '0981123456',
      documentType: 'CI',
      documentNumber: '123',
      country: 'Paraguay',
      city: 'Encarnación',
      status: ContactStatus.ACTIVE,
      createdAt,
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(updatedAt.getTime());
  });
});
