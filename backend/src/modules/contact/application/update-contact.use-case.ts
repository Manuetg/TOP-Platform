import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, BusinessStatus, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../domain/contact.repository';
import { Contact } from '../domain/contact.entity';
import { ContactBusinessNotFoundError, ContactBusinessUnavailableError, ContactNotFoundError, InvalidContactInputError } from './contact.errors';
import { contactFields, contactUuid, type ContactFieldInput } from './contact.validation';

export interface UpdateContactInput extends ContactFieldInput { businessId: string; contactId: string; }
const fields = ['name', 'lastName', 'phone', 'whatsapp', 'email', 'documentType', 'documentNumber', 'country', 'city'] as const;
@Injectable()
export class UpdateContactUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository) {}
  async execute(input: UpdateContactInput): Promise<Contact> {
    if (!contactUuid.test(input.businessId)) throw new InvalidContactInputError('El identificador del negocio no es válido.');
    if (!contactUuid.test(input.contactId)) throw new InvalidContactInputError('El identificador del contacto no es válido.');
    if (!fields.some((field) => input[field] !== undefined)) throw new InvalidContactInputError('Se requiere al menos un campo actualizable.');
    const business = await this.businesses.findById(input.businessId);
    if (!business) throw new ContactBusinessNotFoundError('El negocio no existe.');
    if (business.status !== BusinessStatus.ACTIVE) throw new ContactBusinessUnavailableError('El negocio no está activo.');
    const contact = await this.contacts.findByIdAndBusinessId(input.contactId, input.businessId);
    if (!contact) throw new ContactNotFoundError('El contacto no existe.');
    const final = contactFields(input, contact);
    return this.contacts.update(contact.update(final));
  }
}
