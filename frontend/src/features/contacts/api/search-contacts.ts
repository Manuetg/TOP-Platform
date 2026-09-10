import { apiRequest } from "../../../shared/api/api-client";
import type { Contact } from "../types/contact.types";

interface SearchContactsOptions {
  businessId: string;
  query?: string;
  accessToken?: string | null;
}

export function searchContacts({
  businessId,
  query,
  accessToken,
}: SearchContactsOptions): Promise<Contact[]> {
  const normalizedQuery = query?.trim();

  const search =
    normalizedQuery && normalizedQuery.length > 0
      ? `?query=${encodeURIComponent(normalizedQuery)}`
      : "";

  return apiRequest<Contact[]>(
    `/businesses/${businessId}/contacts${search}`,
    {
      method: "GET",
      accessToken,
    },
  );
}