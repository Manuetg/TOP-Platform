import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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

function matchesFinancialContext(key: readonly unknown[], options: Options) {
  return (key[0] === "payments" || key[0] === "outstanding-balance" || key[0] === "payment-history") &&
    key[2] === options.businessId && key[3] === options.bookingId;
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
  const intent = useRef<{ scope: string; fingerprint: string; key: string } | null>(null);
  const scope = JSON.stringify([options.businessId, options.bookingId]);
  useEffect(() => { intent.current = null; }, [scope]);
  type Request = { input: RegisterPaymentInput; context: Options; key: string };
  const mutation = useMutation({
    retry: false,
    mutationFn: ({ input, context, key }: Request) => registerPayment({ ...context, input, idempotencyKey: key }),
    onSuccess: async (_payment, request) => {
      if (intent.current?.key === request.key) intent.current = null;
      const context = request.context;
      await Promise.all([
        queryClient.invalidateQueries({ predicate: (query) => matchesFinancialContext(query.queryKey, context) }),
        queryClient.invalidateQueries({ queryKey: ["bookings", context.businessId] }),
        queryClient.invalidateQueries({ queryKey: ["availability", "calendar", context.businessId] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard", context.businessId] }),
      ]);
    },
  });
  function request(input: RegisterPaymentInput): Request {
    const fingerprint = JSON.stringify([input.amountMinor, input.method, input.paidAt, input.reference ?? null, input.note ?? null]);
    if (intent.current?.scope !== scope || intent.current.fingerprint !== fingerprint) {
      intent.current = { scope, fingerprint, key: crypto.randomUUID() };
    }
    // Captura el negocio y la reserva del envío; una respuesta tardía no invalida el contexto nuevo.
    return { input, context: { ...options }, key: intent.current.key };
  }
  return { ...mutation, mutate: (input: RegisterPaymentInput) => mutation.mutate(request(input)), mutateAsync: (input: RegisterPaymentInput) => mutation.mutateAsync(request(input)) };
}

export function useSavePaymentPlan(options: Options) {
  const queryClient = useQueryClient();
  type Input = { input: PaymentPlanInput; replace: boolean };
  const mutation = useMutation({
    mutationFn: ({ input, replace, context }: Input & { context: Options }) =>
      savePaymentPlan({ ...context, input, replace }),
    onSuccess: async (_plan, request) => {
      await queryClient.invalidateQueries({ predicate: (query) => matchesFinancialContext(query.queryKey, request.context) });
    },
  });
  return {
    ...mutation,
    mutate: (input: Input) => mutation.mutate({ ...input, context: { ...options } }),
    mutateAsync: (input: Input) => mutation.mutateAsync({ ...input, context: { ...options } }),
  };
}
