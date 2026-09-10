import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";
import type { CreateContactInput } from "./create-contact";

interface UpdateContactOptions {
  businessId: string;
  contactId: string;
  accessToken?: string | null;
  input: Partial<CreateContactInput>;
}

export function updateContact({
  businessId,
  contactId,
  accessToken,
  input,
}: UpdateContactOptions): Promise<Contact> {
  return apiRequest<Contact>(
    `/businesses/${businessId}/contacts/${contactId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}