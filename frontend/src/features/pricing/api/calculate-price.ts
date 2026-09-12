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
}

export function calculatePrice({
  businessId,
  ratePlanId,
  input,
  accessToken,
}: CalculatePriceOptions): Promise<CalculatePriceResult> {
  return apiRequest<CalculatePriceResult>(
    `/businesses/${businessId}/rate-plans/${ratePlanId}/calculate`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}