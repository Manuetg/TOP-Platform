import { useInfiniteQuery } from "@tanstack/react-query";
import { getBookingTimeline } from "../api/get-booking-timeline";

interface UseBookingTimelineOptions {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useBookingTimeline({
  businessId,
  bookingId,
  accessToken,
}: UseBookingTimelineOptions) {
  return useInfiniteQuery({
    queryKey: [
      "booking-timeline",
      businessId,
      bookingId,
    ],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      getBookingTimeline({
        businessId,
        bookingId,
        cursor: pageParam,
        accessToken,
      }),
    getNextPageParam: (lastPage) =>
      lastPage.pageInfo.hasNextPage
        ? lastPage.pageInfo.nextCursor
        : undefined,
    enabled:
      businessId.length > 0 &&
      bookingId.length > 0,
  });
}