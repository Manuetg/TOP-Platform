import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../auth/context/AuthContext";
import { listBusinesses } from "../api/list-businesses";
import type { Business } from "../types/business.types";
type BusinessContextValue = { businesses: Business[]; activeBusiness: Business | null; activeBusinessId: string; activeRole: string | null; status: "loading"|"ready"|"empty"|"selection-required"|"error"; error: Error | null; retry: () => void };
const Context = createContext<BusinessContextValue | undefined>(undefined);
export function BusinessProvider({ children }: PropsWithChildren) {
  const { session, status: authStatus } = useAuth();
  const query = useQuery({ queryKey: ["businesses"], queryFn: () => listBusinesses(session!.accessToken), enabled: authStatus === "authenticated" && Boolean(session?.accessToken), retry: false });
  const active = useMemo(() => (query.data ?? []).filter((b) => b.status === "ACTIVE"), [query.data]);
  const activeBusiness = active.length === 1 ? active[0] : null;
  const activeRole = activeBusiness ? session?.memberships.find((m) => m.businessId === activeBusiness.id)?.role ?? null : null;
  const contextStatus = authStatus !== "authenticated" || query.isLoading ? "loading" : query.isError ? "error" : active.length === 0 ? "empty" : active.length > 1 || !activeRole ? "selection-required" : "ready";
  return <Context.Provider value={{ businesses: query.data ?? [], activeBusiness, activeBusinessId: activeBusiness?.id ?? "", activeRole, status: contextStatus, error: query.error as Error | null, retry: () => { void query.refetch(); } }}>{children}</Context.Provider>;
}
export function useBusinessContext() { const value = useContext(Context); if (!value) throw new Error("useBusinessContext debe utilizarse dentro de BusinessProvider."); return value; }
