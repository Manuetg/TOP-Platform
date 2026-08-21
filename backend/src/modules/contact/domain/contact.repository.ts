import { Contact } from './contact.entity';

export const CONTACT_REPOSITORY = Symbol('CONTACT_REPOSITORY');
export interface CreateContactData { businessId: string; name: string; lastName: string | null; phone: string | null; whatsapp: string | null; email: string | null; documentType: string | null; documentNumber: string | null; country: string | null; city: string | null; }
export interface ContactRepository { create(data: CreateContactData): Promise<Contact>; findByIdAndBusinessId(id: string, businessId: string): Promise<Contact | null>; searchByBusinessId(businessId: string, query: string | null): Promise<Contact[]>; update(contact: Contact): Promise<Contact>; }
