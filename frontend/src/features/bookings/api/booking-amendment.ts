import { apiRequest, ApiResponseError } from "../../../shared/api/api-client";
import type { Booking } from "../types/booking.types";
import type { BookingAmendmentInput, BookingAmendmentPreview, SaveBookingAmendmentInput } from "../types/booking-amendment.types";

export interface AmendmentContext {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

function isFinancialVersion(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export async function previewBookingAmendment(options: AmendmentContext & { input: BookingAmendmentInput; signal?: AbortSignal }): Promise<BookingAmendmentPreview> {
  const preview = await apiRequest<BookingAmendmentPreview>(`/businesses/${options.businessId}/bookings/${options.bookingId}/amendment-preview`, {
    method: "POST", body: JSON.stringify(options.input), accessToken: options.accessToken,
    signal: options.signal, skipUnauthorizedRecovery: true,
  });
  if (!preview || typeof preview !== "object" || !isFinancialVersion(preview.expectedFinancialVersion) ||
    !preview.financialSummary || !isFinancialVersion(preview.financialSummary.financialVersion) ||
    preview.expectedFinancialVersion !== preview.financialSummary.financialVersion) {
    throw Object.assign(new ApiResponseError(), { message: "La revisión no contiene una versión financiera válida. Volvé a consultar antes de guardar." });
  }
  return preview;
}

export function saveBookingAmendment(options: AmendmentContext & { input: SaveBookingAmendmentInput; signal?: AbortSignal }): Promise<Booking> {
  if (!isFinancialVersion(options.input.expectedFinancialVersion)) {
    return Promise.reject(Object.assign(new ApiResponseError(), { message: "La revisión no contiene una versión financiera válida. Volvé a revisar antes de guardar." }));
  }
  return apiRequest(`/businesses/${options.businessId}/bookings/${options.bookingId}/amendment`, {
    method: "PATCH", body: JSON.stringify(options.input), accessToken: options.accessToken,
    signal: options.signal, skipUnauthorizedRecovery: true,
  });
}
