import { apiRequest } from "../../../shared/api/api-client";
import type {
  RatePlan,
  UpdateRatePlanInput,
} from "../types/pricing.types";

interface UpdateRatePlanOptions {
  businessId: string;
  ratePlanId: string;
  input: UpdateRatePlanInput;
  accessToken?: string | null;
}

export function updateRatePlan({
  businessId,
  ratePlanId,
  input,
  accessToken,
}: UpdateRatePlanOptions): Promise<RatePlan> {
  return apiRequest<RatePlan>(
    `/businesses/${businessId}/rate-plans/${ratePlanId}`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}