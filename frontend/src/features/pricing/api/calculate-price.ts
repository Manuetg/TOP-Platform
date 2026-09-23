import { apiRequest } from "../../../shared/api/api-client";
import type {
  CalculatePriceInput,
  CalculatePriceResult,
} from "../types/pricing.types";

interface CalculatePriceOptions {
  businessId: string;
  ratePlanId: string;
  input: CalculatePriceInput;
  accessToken?: string | null;
  signal?: AbortSignal;
}

export function calculatePrice({
  businessId,
  ratePlanId,
  input,
  accessToken,
  signal,
}: CalculatePriceOptions): Promise<CalculatePriceResult> {
  return apiRequest<CalculatePriceResult>(
    `/businesses/${businessId}/rate-plans/${ratePlanId}/calculate`,
    {
      method: "POST",
      accessToken,
      signal,
      body: JSON.stringify(input),
    },
  );
}