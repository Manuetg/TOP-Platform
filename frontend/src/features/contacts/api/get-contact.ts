import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";

interface GetContactOptions {
  businessId: string;
  contactId: string;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function getContact({
  businessId,
  contactId,
  accessToken,
  signal,
}: GetContactOptions): Promise<Contact> {
  return apiRequest<Contact>(
    `/businesses/${businessId}/contacts/${contactId}`,
    {
      method: "GET",
      accessToken,
      signal,
    },
  );
}