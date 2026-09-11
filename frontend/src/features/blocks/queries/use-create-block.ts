import {
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { createBlock } from "../api/create-block";
import type { CreateBlockInput } from "../types/block.types";

interface UseCreateBlockOptions {
  businessId: string;
  accessToken?: string | null;
}

export function useCreateBlock({
  businessId,
  accessToken,
}: UseCreateBlockOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateBlockInput) =>
      createBlock({
        businessId,
        accessToken,
        ...input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["blocks", businessId],
      });
    },
  });
}