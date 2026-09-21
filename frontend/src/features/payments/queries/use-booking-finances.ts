import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../shared/api/api-client";
import {
  getOutstandingBalance,
  getPaymentPlan,
  listPayments,
  registerPayment,
  savePaymentPlan,
} from "../api/payment-api";
import type { PaymentPlanInput, RegisterPaymentInput } from "../types/payment.types";

interface Options {
  businessId: string;
  bookingId: string;
  accessToken?: string | null;
}

export function useBookingFinances(options: Options) {
  const enabled = options.businessId.length > 0 && options.bookingId.length > 0;
  const balance = useQuery({
    queryKey: ["payments", "balance", options.businessId, options.bookingId],
    queryFn: () => getOutstandingBalance(options),
    enabled,
  });
  const plan = useQuery({
    queryKey: ["payments", "plan", options.businessId, options.bookingId],
    queryFn: async () => {
      try { return await getPaymentPlan(options); }
      catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
    },
    enabled,
  });
  const history = useInfiniteQuery({
    queryKey: ["payments", "history", options.businessId, options.bookingId],
    queryFn: ({ pageParam }) => listPayments({ ...options, cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
    enabled,
  });
  return { balance, plan, history };
}

export function useRegisterPayment(options: Options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterPaymentInput) =>
      registerPayment({ ...options, input, idempotencyKey: crypto.randomUUID() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", undefined, options.businessId, options.bookingId] });
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}

export function useSavePaymentPlan(options: Options) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, replace }: { input: PaymentPlanInput; replace: boolean }) =>
      savePaymentPlan({ ...options, input, replace }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments"] });
    },
  });
}
