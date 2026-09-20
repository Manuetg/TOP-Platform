import { ContactStatus } from '../domain/contact-status.enum';
export interface ContactSearchMatch { id: string; title: string; subtitle: string | null; status: ContactStatus; }
export const CONTACT_SEARCH_READER = Symbol('CONTACT_SEARCH_READER');
export interface ContactSearchReader { read(businessId: string, query: string): Promise<ContactSearchMatch[]>; }
