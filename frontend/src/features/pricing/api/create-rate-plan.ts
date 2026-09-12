import { apiRequest } from "../../../shared/api/api-client";
import type {
  CreateRatePlanInput,
  RatePlan,
} from "../types/pricing.types";

interface CreateRatePlanOptions {
  businessId: string;
  input: CreateRatePlanInput;
  accessToken?: string | null;
}

export function createRatePlan({
  businessId,
  input,
  accessToken,
}: CreateRatePlanOptions): Promise<RatePlan> {
  return apiRequest<RatePlan>(
    `/businesses/${businessId}/rate-plans`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}