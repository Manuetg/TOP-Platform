import { useQuery } from "@tanstack/react-query";
import { getContact } from "../api/get-contact";

interface UseContactOptions {
  businessId: string;
  contactId: string;
  accessToken?: string | null;
}

export function useContact({
  businessId,
  contactId,
  accessToken,
}: UseContactOptions) {
  return useQuery({
    queryKey: ["contacts", businessId, contactId],
    queryFn: () =>
      getContact({
        businessId,
        contactId,
        accessToken,
      }),
    enabled:
      businessId.length > 0 &&
      contactId.length > 0,
  });
}