import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../domain/contact.repository';
import { Contact } from '../domain/contact.entity';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from './contact.errors';
import { contactUuid } from './contact.validation';

@Injectable()
export class ArchiveContactUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository) {}

  async execute(businessId: string, contactId: string, actorUserId: string): Promise<Contact> {
    if (![businessId, contactId, actorUserId].every((id) => contactUuid.test(id))) throw new InvalidContactInputError('Los identificadores de negocio, contacto y actor son obligatorios y válidos.');
    const business = await this.businesses.findById(businessId);
    if (!business) throw new ContactBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ContactBusinessUnavailableError('El negocio no está activo.');
    const contact = await this.contacts.archive(contactId, businessId, actorUserId);
    if (!contact) throw new ContactNotFoundError('El contacto no existe.');
    return contact;
  }
}
