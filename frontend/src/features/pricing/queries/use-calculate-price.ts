import { useMutation } from "@tanstack/react-query";
import { calculatePrice } from "../api/calculate-price";
import type { CalculatePriceInput } from "../types/pricing.types";

interface UseCalculatePriceOptions {
  businessId: string;
  ratePlanId: string;
  accessToken?: string | null;
}

export function useCalculatePrice({
  businessId,
  ratePlanId,
  accessToken,
}: UseCalculatePriceOptions) {
  return useMutation({
    mutationFn: (
      input: CalculatePriceInput,
    ) =>
      calculatePrice({
        businessId,
        ratePlanId,
        input,
        accessToken,
      }),
  });
}