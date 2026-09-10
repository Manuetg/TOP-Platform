import { useQuery } from "@tanstack/react-query";
import { searchContacts } from "../api/search-contacts";

interface UseContactsOptions {
  businessId: string;
  query?: string;
  accessToken?: string | null;
}

export function useContacts({
  businessId,
  query,
  accessToken,
}: UseContactsOptions) {
  const normalizedQuery = query?.trim() ?? "";

  return useQuery({
    queryKey: [
      "contacts",
      businessId,
      normalizedQuery,
    ],
    queryFn: () =>
      searchContacts({
        businessId,
        query:
          normalizedQuery.length > 0
            ? normalizedQuery
            : undefined,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}