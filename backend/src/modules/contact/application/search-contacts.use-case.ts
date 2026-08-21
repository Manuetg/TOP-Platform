import { Inject, Injectable } from '@nestjs/common';
import { BUSINESS_REPOSITORY, type BusinessRepository } from '../../business/business.contract';
import { CONTACT_REPOSITORY, type ContactRepository } from '../domain/contact.repository';
import { Contact } from '../domain/contact.entity';
import { ContactBusinessNotFoundError, InvalidContactInputError } from './contact.errors';
import { contactUuid } from './contact.validation';

@Injectable()
export class SearchContactsUseCase {
  constructor(@Inject(BUSINESS_REPOSITORY) private readonly businesses: BusinessRepository, @Inject(CONTACT_REPOSITORY) private readonly contacts: ContactRepository) {}
  async execute(businessId: string, query?: unknown): Promise<Contact[]> {
    if (!contactUuid.test(businessId)) throw new InvalidContactInputError('El identificador del negocio no es válido.');
    const normalized = this.query(query);
    if (!(await this.businesses.findById(businessId))) throw new ContactBusinessNotFoundError('El negocio no existe.');
    return this.contacts.searchByBusinessId(businessId, normalized);
  }
  private query(value: unknown): string | null { if (value === undefined) return null; if (typeof value !== 'string') throw new InvalidContactInputError('La búsqueda es inválida.'); const query = value.trim(); if (query.length === 0 || query.length > 120) throw new InvalidContactInputError('La búsqueda es inválida.'); return query; }
}
