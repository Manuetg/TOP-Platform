import type { BookingStatus } from "./types/booking.types";

export const bookingStatusLabels: Record<BookingStatus, string> = {
  DRAFT: "Borrador",
  PENDING: "Pendiente",
  CONFIRMED: "Confirmada",
  IN_PROGRESS: "En curso",
  COMPLETED: "Finalizada",
  CANCELLED: "Cancelada",
  NO_SHOW: "No show",
};

export const bookingStatusOptions: readonly {
  value: BookingStatus;
  label: string;
}[] = [
  { value: "DRAFT", label: bookingStatusLabels.DRAFT },
  { value: "PENDING", label: bookingStatusLabels.PENDING },
  { value: "CONFIRMED", label: bookingStatusLabels.CONFIRMED },
  { value: "IN_PROGRESS", label: bookingStatusLabels.IN_PROGRESS },
  { value: "COMPLETED", label: bookingStatusLabels.COMPLETED },
  { value: "CANCELLED", label: bookingStatusLabels.CANCELLED },
  { value: "NO_SHOW", label: bookingStatusLabels.NO_SHOW },
];

export function getBookingStatusLabel(status: BookingStatus): string {
  return bookingStatusLabels[status] ?? status;
}

export function isBookingStatus(status: string): status is BookingStatus {
  return Object.hasOwn(bookingStatusLabels, status);
}
