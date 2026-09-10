import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";

interface GetContactOptions {
  businessId: string;
  contactId: string;
  accessToken?: string | null;
}

export function getContact({
  businessId,
  contactId,
  accessToken,
}: GetContactOptions): Promise<Contact> {
  return apiRequest<Contact>(
    `/businesses/${businessId}/contacts/${contactId}`,
    {
      method: "GET",
      accessToken,
    },
  );
}