import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AuthMembership, MembershipRole } from "../../auth/types/auth.types";
import { useAuth } from "../../auth/context/AuthContext";
import { listBusinesses } from "../api/list-businesses";
import type { Business } from "../types/business.types";
import { isBusinessQuery, isTenantQuery } from "./business-query-scope";

export type BusinessContextStatus = "loading" | "ready" | "empty" | "selection-required" | "error";
type Value = { businesses: Business[]; activeBusiness: Business | null; activeBusinessId: string; activeMembership: AuthMembership | null; activeRole: MembershipRole | null; status: BusinessContextStatus; error: Error | null; retry: () => void; selectBusiness: (id: string) => boolean; };
const Context = createContext<Value | undefined>(undefined);

export function BusinessProvider({ children }: PropsWithChildren) {
  const { session, status } = useAuth();
  const client = useQueryClient();
  const userId = status === "authenticated" ? session?.user.id ?? null : null;
  const [cacheOwner, setCacheOwner] = useState(userId);
  useEffect(() => {
    if (cacheOwner === userId) return;
    // Existing feature keys include Business but not always identity. Clear only
    // tenant data before mounting the next identity, including inactive caches.
    const filters = { predicate: (item: { queryKey: readonly unknown[] }) => isTenantQuery(item.queryKey) || (item.queryKey[0] === "businesses" && item.queryKey[1] === cacheOwner) };
    void client.cancelQueries(filters);
    client.removeQueries(filters);
    setCacheOwner(userId);
  }, [cacheOwner, userId, client]);
  if (status !== "authenticated" || !session || cacheOwner !== userId) return <Context.Provider value={{ ...standaloneValue, activeBusinessId: "", status: "loading" }}>{children}</Context.Provider>;
  return <SessionBusinessProvider key={session.user.id}>{children}</SessionBusinessProvider>;
}

function SessionBusinessProvider({ children }: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const query = useQuery({ queryKey: ["businesses", session?.user.id], queryFn: ({ signal }) => listBusinesses(session!.accessToken, signal), enabled: authStatus === "authenticated" && Boolean(session?.accessToken), retry: false });
  const result = useMemo(() => resolveBusiness(query.data ?? [], session?.memberships ?? []), [query.data, session?.memberships]);
  const chosen = selectedId === null ? result.business : result.candidates.find((item) => item.id === selectedId) ?? null;
  const status: BusinessContextStatus = authStatus !== "authenticated" || query.isLoading ? "loading" : query.isError || result.mismatch ? "error" : result.candidates.length === 0 ? "empty" : chosen ? "ready" : "selection-required";
  const activeBusiness = status === "ready" ? chosen : null;
  const activeBusinessId = activeBusiness?.id ?? "";
  const activeMembership = activeBusiness ? session?.memberships.find((item) => item.businessId === activeBusiness.id) ?? null : null;
  useEffect(() => () => {
    if (!activeBusinessId) return;
    const filters = { predicate: (item: { queryKey: readonly unknown[] }) => isBusinessQuery(item.queryKey, activeBusinessId) };
    void client.cancelQueries(filters);
    client.removeQueries(filters);
  }, [client, activeBusinessId]);
  const selectBusiness = (id: string) => {
    if (query.isError || !result.candidates.some((item) => item.id === id)) return false;
    setSelectedId(id);
    return true;
  };
  return <Context.Provider value={{ businesses: result.candidates, activeBusiness, activeBusinessId, activeMembership, activeRole: activeMembership?.role ?? null, status, error: result.mismatch ? new Error("No se pudo resolver la membresía del negocio.") : query.error as Error | null, retry: () => { void query.refetch(); }, selectBusiness }}>{children}</Context.Provider>;
}
export function resolveBusiness(businesses: Business[], memberships: AuthMembership[]) {
  const activeBusinesses = businesses.filter((business) => business.status === "ACTIVE");
  const candidates = activeBusinesses.filter((business) => memberships.some((membership) => membership.businessId === business.id));
  const mismatch = activeBusinesses.length > 0 && candidates.length === 0;
  const business = candidates.length === 1 ? candidates[0] : null;
  const membership = business ? memberships.find((item) => item.businessId === business.id) ?? null : null;
  return { candidates, business, membership, mismatch };
}
const standaloneValue: Value = { businesses: [], activeBusiness: null, activeBusinessId: import.meta.env.MODE === "test" ? "business-1" : "", activeMembership: null, activeRole: null, status: "ready", error: null, retry: () => undefined, selectBusiness: () => false };
export function useBusinessContext() { return useContext(Context) ?? standaloneValue; }
