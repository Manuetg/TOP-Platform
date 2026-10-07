import { useMutation, useQueryClient } from "@tanstack/react-query";
import { getBooking } from "../api/get-booking";
import { operateBooking } from "../api/operate-booking";
import type { Booking, BookingOperation, BookingOperationInput } from "../types/booking.types";

interface Options { userId: string; businessId: string; bookingId: string; accessToken: string }
interface RequestScope { signal: AbortSignal; isCurrent: () => boolean }
interface OperationRequest extends BookingOperationInput, RequestScope { operation: BookingOperation }

export function useBookingOperation(options: Options) {
  const client = useQueryClient();
  const detailKey = ["bookings", options.businessId, options.bookingId];

  async function reconcile(booking: Booking, scope: RequestScope, refreshDetail = true) {
    const currentScope = !scope.signal.aborted && scope.isCurrent();
    if (currentScope) {
      const current = client.getQueryData<Booking>(detailKey);
      client.setQueryData(detailKey, current?.id === booking.id && current.businessId === booking.businessId ? { ...current, ...booking } : booking);
    }
    // A known server response may have committed after the screen changed.
    // Invalidate its original scope; never derive a destination from the current context.
    await Promise.all([
      client.invalidateQueries({ queryKey: ["bookings", options.businessId], predicate: (query) => query.queryKey.length !== 3 }),
      ...(refreshDetail || !currentScope ? [client.invalidateQueries({ queryKey: detailKey, exact: true })] : []),
      client.invalidateQueries({ queryKey: ["booking-timeline", options.businessId, options.bookingId] }),
      client.invalidateQueries({ queryKey: ["availability", "calendar", options.businessId] }),
      client.invalidateQueries({ queryKey: ["availability", "check", options.businessId] }),
      client.invalidateQueries({ queryKey: ["dashboard", options.businessId] }),
      client.invalidateQueries({ queryKey: ["outstanding-balance", options.userId, options.businessId, options.bookingId] }),
    ]);
  }

  const mutation = useMutation({
    retry: false,
    mutationFn: async (input: OperationRequest) => {
      const booking = await operateBooking({ ...options, ...input });
      await reconcile(booking, input);
      return booking;
    },
  });

  async function reload(scope: RequestScope) {
    const booking = await getBooking({ ...options, signal: scope.signal });
    await reconcile(booking, scope, false);
    return booking;
  }

  return { ...mutation, reload };
}
