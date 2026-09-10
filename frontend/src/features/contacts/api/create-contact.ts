import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";

export interface CreateContactInput {
  name: string;
  lastName?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  documentType?: string | null;
  documentNumber?: string | null;
  country?: string | null;
  city?: string | null;
}

interface CreateContactOptions {
  businessId: string;
  accessToken?: string | null;
  input: CreateContactInput;
}

export function createContact({
  businessId,
  accessToken,
  input,
}: CreateContactOptions): Promise<Contact> {
  return apiRequest<Contact>(
    `/businesses/${businessId}/contacts`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}