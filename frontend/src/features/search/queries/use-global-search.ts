import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/context/AuthContext";
import { useBusinessContext } from "../../business/context/BusinessContext";
import { searchBusiness } from "../api/search-business";

export function useGlobalSearch(text: string, open: boolean) {
  const { session, status } = useAuth();
  const { activeBusinessId, status: businessStatus } = useBusinessContext();
  const client = useQueryClient();
  const normalized = text.trim();
  const userId = session?.user.id ?? "";
  const key = ["global-search", userId, activeBusinessId, normalized];
  const fingerprint = JSON.stringify([userId, activeBusinessId, text, open, status, businessStatus]);
  const eligible = open && status === "authenticated" && businessStatus === "ready" && normalized.length >= 2 && normalized.length <= 120;
  const [settled, setSettled] = useState("");

  useEffect(() => {
    setSettled("");
    const timer = eligible ? window.setTimeout(() => setSettled(fingerprint), 250) : undefined;
    return () => {
      window.clearTimeout(timer);
      void client.cancelQueries({ queryKey: ["global-search", userId, activeBusinessId, normalized], exact: true });
    };
  }, [fingerprint, eligible, client, userId, activeBusinessId, normalized]);

  const enabled = eligible && settled === fingerprint;
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => searchBusiness(activeBusinessId, normalized, session!.accessToken, signal),
    enabled, retry: false, gcTime: 0, staleTime: 0,
    refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  return {
    data: enabled ? query.data : undefined,
    loading: eligible && (!enabled || query.isFetching),
    error: enabled && query.isError,
    retry: () => { if (enabled) void query.refetch(); },
    scope: JSON.stringify([userId, activeBusinessId, status, businessStatus]),
  };
}
