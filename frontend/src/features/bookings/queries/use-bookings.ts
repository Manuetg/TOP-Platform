import { useQuery } from "@tanstack/react-query";
import { listBookings } from "../api/list-bookings";
import type { BookingStatus } from "../types/booking.types";

interface UseBookingsOptions {
  businessId: string;
  status?: BookingStatus;
  contactId?: string;
  resourceId?: string;
  accessToken?: string | null;
}

export function useBookings({
  businessId,
  status,
  contactId,
  resourceId,
  accessToken,
}: UseBookingsOptions) {
  return useQuery({
    queryKey: [
      "bookings",
      businessId,
      status ?? "",
      contactId ?? "",
      resourceId ?? "",
    ],
    queryFn: () =>
      listBookings({
        businessId,
        status,
        contactId,
        resourceId,
        accessToken,
      }),
    enabled: businessId.length > 0,
  });
}