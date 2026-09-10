import { apiRequest } from "../../../shared/api/api-client";
import type {
  AvailabilityRules,
  UpdateAvailabilityRulesInput,
} from "../types/availability.types";

interface UpdateAvailabilityRulesOptions {
  businessId: string;
  input: UpdateAvailabilityRulesInput;
  accessToken?: string | null;
}

export function updateAvailabilityRules({
  businessId,
  input,
  accessToken,
}: UpdateAvailabilityRulesOptions): Promise<AvailabilityRules> {
  return apiRequest<AvailabilityRules>(
    `/businesses/${businessId}/availability-rules`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify(input),
    },
  );
}