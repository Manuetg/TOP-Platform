import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";

export function archiveContact({ businessId, contactId, accessToken, signal }: { businessId: string; contactId: string; accessToken?: string | null; signal?: AbortSignal }): Promise<Contact> {
  return apiRequest<Contact>(`/businesses/${businessId}/contacts/${contactId}/archive`, { method: "PATCH", accessToken, signal });
}
