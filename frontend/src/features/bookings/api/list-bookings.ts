import { apiRequest } from "../../../shared/api/api-client";
import type {
  Booking,
  ListBookingsInput,
} from "../types/booking.types";

interface ListBookingsOptions
  extends ListBookingsInput {
  businessId: string;
  accessToken?: string | null;
}

export function listBookings({
  businessId,
  status,
  contactId,
  resourceId,
  accessToken,
}: ListBookingsOptions): Promise<Booking[]> {
  const query = new URLSearchParams();

  if (status) {
    query.set("status", status);
  }

  if (contactId) {
    query.set("contactId", contactId);
  }

  if (resourceId) {
    query.set("resourceId", resourceId);
  }

  const suffix = query.toString();

  return apiRequest<Booking[]>(
    `/businesses/${businessId}/bookings${
      suffix ? `?${suffix}` : ""
    }`,
    {
      accessToken,
    },
  );
}