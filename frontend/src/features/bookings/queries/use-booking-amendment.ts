import { useMutation, useQueryClient } from "@tanstack/react-query";
import { previewBookingAmendment, saveBookingAmendment, type AmendmentContext } from "../api/booking-amendment";
import type { BookingAmendmentInput, SaveBookingAmendmentInput } from "../types/booking-amendment.types";

export function useBookingAmendment(context: AmendmentContext) {
  const client = useQueryClient();
  const preview = useMutation({ retry: false,
    mutationFn: ({ input, captured, signal }: { input: BookingAmendmentInput; captured: AmendmentContext; signal: AbortSignal }) => previewBookingAmendment({ ...captured, input, signal }),
  });
  const save = useMutation({ retry: false,
    mutationFn: ({ input, captured, signal }: { input: SaveBookingAmendmentInput; captured: AmendmentContext; signal: AbortSignal }) => saveBookingAmendment({ ...captured, input, signal }),
    onSuccess: async (_booking, { captured }) => {
      await Promise.all([
        // El editor conserva su versión hasta navegar; el detalle siguiente consulta el dato canónico.
        client.invalidateQueries({ queryKey: ["bookings", captured.businessId], refetchType: "none" }),
        client.invalidateQueries({ queryKey: ["booking-timeline", captured.businessId, captured.bookingId] }),
        client.invalidateQueries({ queryKey: ["payments"], predicate: (query) => query.queryKey[2] === captured.businessId && query.queryKey[3] === captured.bookingId }),
        client.invalidateQueries({ queryKey: ["outstanding-balance"], predicate: (query) => query.queryKey[2] === captured.businessId && query.queryKey[3] === captured.bookingId }),
        client.invalidateQueries({ queryKey: ["payment-history"], predicate: (query) => query.queryKey[2] === captured.businessId && query.queryKey[3] === captured.bookingId }),
        client.invalidateQueries({ queryKey: ["availability", "calendar", captured.businessId] }),
        client.invalidateQueries({ queryKey: ["dashboard", captured.businessId] }),
      ]);
    },
  });
  return {
    preview: (input: BookingAmendmentInput, signal: AbortSignal) => preview.mutateAsync({ input, captured: { ...context }, signal }),
    save: (input: SaveBookingAmendmentInput, signal: AbortSignal) => save.mutateAsync({ input, captured: { ...context }, signal }),
  };
}
