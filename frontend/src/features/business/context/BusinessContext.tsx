import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import type { AuthMembership, MembershipRole } from "../../auth/types/auth.types";
import { useAuth } from "../../auth/context/AuthContext";
import { listBusinesses } from "../api/list-businesses";
import type { Business } from "../types/business.types";

export type BusinessContextStatus = "loading" | "ready" | "empty" | "selection-required" | "error";
type Value = { businesses: Business[]; activeBusiness: Business | null; activeBusinessId: string; activeMembership: AuthMembership | null; activeRole: MembershipRole | null; status: BusinessContextStatus; error: Error | null; retry: () => void; };
const Context = createContext<Value | undefined>(undefined);

export function BusinessProvider({ children }: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();
  const query = useQuery({ queryKey: ["businesses", session?.user.id], queryFn: () => listBusinesses(session!.accessToken), enabled: authStatus === "authenticated" && Boolean(session?.accessToken), retry: false });
  const result = useMemo(() => resolveBusiness(query.data ?? [], session?.memberships ?? []), [query.data, session?.memberships]);
  const status: BusinessContextStatus = authStatus !== "authenticated" || query.isLoading ? "loading" : query.isError ? "error" : result.mismatch ? "error" : result.candidates.length === 0 ? "empty" : result.candidates.length > 1 ? "selection-required" : "ready";
  const activeBusiness = status === "ready" ? result.business : null;
  const activeMembership = status === "ready" ? result.membership : null;
  return <Context.Provider value={{ businesses: query.data ?? [], activeBusiness, activeBusinessId: activeBusiness?.id ?? "", activeMembership, activeRole: activeMembership?.role ?? null, status, error: result.mismatch ? new Error("No se pudo resolver la membresía del negocio.") : query.error as Error | null, retry: () => { void query.refetch(); } }}>{children}</Context.Provider>;
}
export function resolveBusiness(businesses: Business[], memberships: AuthMembership[]) {
  const activeBusinesses = businesses.filter((business) => business.status === "ACTIVE");
  const candidates = activeBusinesses.filter((business) => memberships.some((membership) => membership.businessId === business.id));
  const mismatch = activeBusinesses.length > 0 && candidates.length === 0;
  const business = candidates.length === 1 ? candidates[0] : null;
  const membership = business ? memberships.find((item) => item.businessId === business.id) ?? null : null;
  return { candidates, business, membership, mismatch };
}
const standaloneValue: Value = { businesses: [], activeBusiness: null, activeBusinessId: import.meta.env.MODE === "test" ? "business-1" : "", activeMembership: null, activeRole: null, status: "ready", error: null, retry: () => undefined };
export function useBusinessContext() { return useContext(Context) ?? standaloneValue; }
