import type { Contact } from './domain/contact.entity';

export const CONTACT_LOOKUP = Symbol('CONTACT_LOOKUP');
export interface ContactLookup { findByIdAndBusinessId(id: string, businessId: string): Promise<Contact | null>; }

export const CONTACT_MESSAGING_LOOKUP = Symbol('CONTACT_MESSAGING_LOOKUP');
export interface ContactMessagingLookup { findByMessagingAddressAndBusinessId(address: string, businessId: string): Promise<Contact | null>; }

export { CONTACT_SEARCH_READER, type ContactSearchReader, type ContactSearchMatch } from './application/contact-search.reader';
