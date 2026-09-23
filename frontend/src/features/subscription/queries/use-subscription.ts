import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { getSubscription } from "../api/subscription";
export function useSubscription() {
  const { session } = useAuth(); const { activeBusinessId } = useBusinessContext();
  return useQuery({ queryKey: ["subscription", session?.user.id, activeBusinessId], queryFn: ({ signal }) => getSubscription(activeBusinessId, session!.accessToken, signal), enabled: Boolean(session && activeBusinessId), retry: false });
}
