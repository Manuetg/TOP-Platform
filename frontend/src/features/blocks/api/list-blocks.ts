import { apiRequest } from "../../../shared/api/api-client";
import type {
  Block,
  ListBlocksInput,
} from "../types/block.types";

interface ListBlocksOptions extends ListBlocksInput {
  businessId: string;
  accessToken?: string | null;
}

export function listBlocks({
  businessId,
  resourceId,
  from,
  to,
  accessToken,
}: ListBlocksOptions): Promise<Block[]> {
  const params = new URLSearchParams();

  if (resourceId) {
    params.set("resourceId", resourceId);
  }

  if (from) {
    params.set("from", from);
  }

  if (to) {
    params.set("to", to);
  }

  const query = params.toString();

  return apiRequest<Block[]>(
    `/businesses/${businessId}/blocks${
      query ? `?${query}` : ""
    }`,
    {
      method: "GET",
      accessToken,
    },
  );
}