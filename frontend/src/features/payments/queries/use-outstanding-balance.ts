import { useQuery } from "@tanstack/react-query";
import { getOutstandingBalance } from "../api/get-outstanding-balance";

interface Options {
  userId?: string;
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  enabled: boolean;
}

export function useOutstandingBalance(input: Options) {
  return useQuery({
    queryKey: ["outstanding-balance", input.userId, input.businessId, input.bookingId],
    queryFn: ({ signal }) => getOutstandingBalance({ ...input, signal }),
    enabled: input.enabled && Boolean(input.userId && input.businessId && input.bookingId && input.accessToken),
    placeholderData: undefined,
    retry: false,
  });
}
