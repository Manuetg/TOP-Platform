import { Contact } from '../../../src/modules/contact/domain/contact.entity';
import { ContactStatus } from '../../../src/modules/contact/domain/contact-status.enum';
import type { ContactRepository, CreateContactData } from '../../../src/modules/contact/domain/contact.repository';

const contacts = new Map<string, Contact>();
export const contactRepositoryFake: ContactRepository = {
  create: (data: CreateContactData) => { const contact = Contact.create({ id: `c0000000-0000-4000-8000-${String(contacts.size + 1).padStart(12, '0')}`, ...data, status: ContactStatus.ACTIVE, createdAt: new Date(), updatedAt: new Date() }); contacts.set(contact.id, contact); return Promise.resolve(contact); },
  findByIdAndBusinessId: (id, businessId) => Promise.resolve(contacts.get(id)?.businessId === businessId ? contacts.get(id) ?? null : null),
  searchByBusinessId: (businessId, query) => Promise.resolve([...contacts.values()].filter((contact) => contact.businessId === businessId && (query === null || [contact.name, contact.lastName, contact.phone, contact.whatsapp, contact.email, contact.documentNumber].some((value) => value?.toLowerCase().includes(query.toLowerCase())))).sort((left, right) => left.name.localeCompare(right.name) || (left.lastName ?? '').localeCompare(right.lastName ?? '') || left.id.localeCompare(right.id))),
  update: (contact) => { contacts.set(contact.id, contact); return Promise.resolve(contact); },
};
export function resetContactRepositoryFake(): void { contacts.clear(); }
