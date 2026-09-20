import { useInfiniteQuery } from "@tanstack/react-query";
import { listPayments } from "../api/list-payments";

interface Options {
  userId?: string;
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
  enabled: boolean;
}

export function usePaymentHistory(input: Options) {
  return useInfiniteQuery({
    queryKey: ["payment-history", input.userId, input.businessId, input.bookingId],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) => listPayments({ ...input, cursor: pageParam, signal }),
    getNextPageParam: (page) => page.pageInfo.hasNextPage ? page.pageInfo.nextCursor : undefined,
    enabled: input.enabled && Boolean(input.userId && input.businessId && input.bookingId && input.accessToken),
    retry: false,
  });
}
