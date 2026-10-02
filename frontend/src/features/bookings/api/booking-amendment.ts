import { apiRequest } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";
import type { BookingAmendmentInput, BookingAmendmentPreview, SaveBookingAmendmentInput } from "../types/booking-amendment.types";

export interface AmendmentContext {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function previewBookingAmendment(options: AmendmentContext & { input: BookingAmendmentInput; signal?: AbortSignal }): Promise<BookingAmendmentPreview> {
  return apiRequest(`/businesses/${options.businessId}/bookings/${options.bookingId}/amendment-preview`, {
    method: "POST", body: JSON.stringify(options.input), accessToken: options.accessToken,
    signal: options.signal, skipUnauthorizedRecovery: true,
  });
}

export function saveBookingAmendment(options: AmendmentContext & { input: SaveBookingAmendmentInput; signal?: AbortSignal }): Promise<Booking> {
  return apiRequest(`/businesses/${options.businessId}/bookings/${options.bookingId}/amendment`, {
    method: "PATCH", body: JSON.stringify(options.input), accessToken: options.accessToken,
    signal: options.signal, skipUnauthorizedRecovery: true,
  });
}
