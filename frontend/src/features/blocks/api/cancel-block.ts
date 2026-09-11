import { apiRequest } from "../../../shared/api/api-client";
import type { Block } from "../types/block.types";

interface CancelBlockOptions {
  businessId: string;
  blockId: string;
  reason: string;
  accessToken?: string | null;
}

export function cancelBlock({
  businessId,
  blockId,
  reason,
  accessToken,
}: CancelBlockOptions): Promise<Block> {
  return apiRequest<Block>(
    `/businesses/${businessId}/blocks/${blockId}/cancel`,
    {
      method: "PATCH",
      accessToken,
      body: JSON.stringify({
        reason,
      }),
    },
  );
}