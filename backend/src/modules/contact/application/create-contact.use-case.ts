import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../domain/contact.repository';
import { Contact } from '../domain/contact.entity';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, InvalidContactInputError } from './contact.errors';
import { contactFields, contactUuid, type ContactFieldInput } from './contact.validation';

export interface CreateContactInput extends ContactFieldInput { businessId: string; }
@Injectable()
export class CreateContactUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository) {}
  async execute(input: CreateContactInput): Promise<Contact> {
    if (!contactUuid.test(input.businessId)) throw new InvalidContactInputError('El identificador del negocio no es válido.');
    const fields = contactFields(input);
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ContactBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ContactBusinessUnavailableError('El negocio no está activo.');
    return this.contacts.create({ businessId: input.businessId, ...fields });
  }
}
