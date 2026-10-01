import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/context/AuthContext";
import { getUserProfile } from "../api/user-profile";

export const userProfileKey = (userId: string) => ["user-profile", userId] as const;

export function useUserProfile() {
  const { session, status } = useAuth();
  return useQuery({
    queryKey: userProfileKey(session?.user.id ?? ""),
    queryFn: ({ signal }) => getUserProfile(session!.user.id, session!.accessToken, signal),
    enabled: status === "authenticated" && Boolean(session),
    retry: false,
  });
}
