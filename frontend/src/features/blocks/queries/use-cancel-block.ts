import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { cancelBlock } from "../api/cancel-block";

interface UseCancelBlockOptions {
  businessId: string;
  accessToken?: string | null;
}

interface CancelBlockInput {
  blockId: string;
  reason: string;
}

export function useCancelBlock({
  businessId,
  accessToken,
}: UseCancelBlockOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      blockId,
      reason,
    }: CancelBlockInput) =>
      cancelBlock({
        businessId,
        blockId,
        reason,
        accessToken,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["blocks", businessId],
      });
    },
  });
}