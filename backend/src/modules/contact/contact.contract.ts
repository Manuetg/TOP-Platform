import type { Contact } from './domain/contact.entity';

export interface ContactMessagingResolutionInput {
  businessId: string;
  address: string;
  name: string;
  existingContactId: string | null;
  transaction: unknown;
}

export const CONTACT_LOOKUP = Symbol('CONTACT_LOOKUP');
export interface ContactLookup { findByIdAndBusinessId(id: string, businessId: string): Promise<Contact | null>; }

export const CONTACT_MESSAGING_LOOKUP = Symbol('CONTACT_MESSAGING_LOOKUP');
export interface ContactMessagingLookup { findByMessagingAddressAndBusinessId(address: string, businessId: string): Promise<Contact | null>; }

export const CONTACT_MESSAGING_RESOLUTION = Symbol('CONTACT_MESSAGING_RESOLUTION');
export interface ContactMessagingResolution {
  resolveOrCreateInTransaction(input: ContactMessagingResolutionInput): Promise<Contact>;
}

export { CONTACT_SEARCH_READER, type ContactSearchReader, type ContactSearchMatch } from './application/contact-search.reader';
