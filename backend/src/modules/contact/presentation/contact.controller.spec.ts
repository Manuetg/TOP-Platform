import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Contact } from '../domain/contact.entity';
import { ContactStatus } from '../domain/contact-status.enum';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from '../application/contact.errors';
import { ContactController } from './contact.controller';

const businessId = '11111111-1111-4111-8111-111111111111'; const contactId = '22222222-2222-4222-8222-222222222222';
const contact = Contact.create({ id: contactId, businessId, name: 'María', lastName: null, phone: '0981123456', whatsapp: null, email: null, documentType: null, documentNumber: null, country: null, city: null, status: ContactStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() });
describe('ContactController', () => {
  const create = jest.fn(); const get = jest.fn(); const search = jest.fn(); const update = jest.fn(); const controller = new ContactController({ execute: create } as never, { execute: get } as never, { execute: search } as never, { execute: update } as never);
  beforeEach(() => jest.resetAllMocks());
  it('maps create, get, search and patch through public DTOs', async () => { create.mockResolvedValueOnce(contact); get.mockResolvedValueOnce(contact); search.mockResolvedValueOnce([contact]); update.mockResolvedValueOnce(contact); await expect(controller.createContact(businessId, { name: 'María', phone: '0981123456' })).resolves.toMatchObject({ id: contactId, fullName: 'María' }); await expect(controller.get(businessId, contactId)).resolves.toMatchObject({ businessId }); await expect(controller.searchContacts(businessId, 'María')).resolves.toHaveLength(1); await expect(controller.update(businessId, contactId, { city: 'Asunción' })).resolves.toMatchObject({ id: contactId }); expect(update).toHaveBeenCalledWith({ businessId, contactId, city: 'Asunción' }); });
  it.each([[new InvalidContactInputError('invalid'), BadRequestException], [new ContactBusinessNotFoundError('missing'), NotFoundException], [new ContactNotFoundError('missing'), NotFoundException], [new ContactBusinessUnavailableError('archived'), ConflictException]])('maps contact errors', async (error, exception) => { create.mockRejectedValueOnce(error); await expect(controller.createContact(businessId, {} as never)).rejects.toBeInstanceOf(exception); });
});
