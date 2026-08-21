import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../domain/contact.repository';
import { Contact } from '../domain/contact.entity';
import { ContactBusinessNotFoundError, ContactNotFoundError, InvalidContactInputError } from './contact.errors';
import { contactUuid } from './contact.validation';

@Injectable()
export class GetContactUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository) {}
  async execute(businessId: string, contactId: string): Promise<Contact> {
    if (!contactUuid.test(businessId)) throw new InvalidContactInputError('El identificador del negocio no es válido.');
    if (!contactUuid.test(contactId)) throw new InvalidContactInputError('El identificador del contacto no es válido.');
    if (!(await this.businesses.findById(businessId))) throw new ContactBusinessNotFoundError('El negocio no existe.');
    const contact = await this.contacts.findByIdAndBusinessId(contactId, businessId);
    if (!contact) throw new ContactNotFoundError('El contacto no existe.');
    return contact;
  }
}
