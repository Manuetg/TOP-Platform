import { apiRequest } from "../../../shared/api/api-client";
import type {
  Block,
  CreateBlockInput,
} from "../types/block.types";

interface CreateBlockOptions
  extends CreateBlockInput {
  businessId: string;
  accessToken?: string | null;
}

export function createBlock({
  businessId,
  resourceId,
  type,
  reason,
  notes,
  startsAt,
  endsAt,
  accessToken,
}: CreateBlockOptions): Promise<Block> {
  return apiRequest<Block>(
    `/businesses/${businessId}/resources/${resourceId}/blocks`,
    {
      method: "POST",
      accessToken,
      body: JSON.stringify({
        type,
        reason,
        notes,
        startsAt,
        endsAt,
      }),
    },
  );
}