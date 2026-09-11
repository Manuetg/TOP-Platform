import { apiRequest } from "../../../shared/api/api-client";
import type { BookingTimelineResponse } from "../types/booking.types";

interface GetBookingTimelineOptions {
  businessId: string;
  bookingId: string;
  cursor?: string | null;
  limit?: number;
  accessToken?: string | null;
}

export function getBookingTimeline({
  businessId,
  bookingId,
  cursor,
  limit = 50,
  accessToken,
}: GetBookingTimelineOptions): Promise<BookingTimelineResponse> {
  const search = new URLSearchParams();

  search.set("limit", String(limit));

  if (cursor) {
    search.set("cursor", cursor);
  }

  return apiRequest<BookingTimelineResponse>(
    `/businesses/${businessId}/bookings/${bookingId}/timeline?${search.toString()}`,
    {
      accessToken,
    },
  );
}