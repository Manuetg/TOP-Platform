import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { LoginResponse } from "../types/auth.types";
import { refreshSession } from "../api/refresh-session";
import { clearPersistedAuthSession, readPersistedAuthSession, writePersistedAuthSession } from "../storage/auth-session-storage";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { logout as revokeSession } from "../api/logout";
import { QueryClientContext } from "@tanstack/react-query";

export type AuthStatus = "restoring" | "authenticated" | "unauthenticated";
let restorePromise: ReturnType<typeof refreshSession> | null = null;
function restore(refreshToken: string) {
  if (!restorePromise) restorePromise = refreshSession(refreshToken).finally(() => { restorePromise = null; });
  return restorePromise;
}

interface AuthContextValue {
  session: LoginResponse | null;
  isAuthenticated: boolean;
  establishSession: (session: LoginResponse) => void;
  logout: () => Promise<void>;
  isLoggingOut: boolean;
  status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("restoring");
  const sessionRef = useRef<LoginResponse | null>(null);
  const logoutPromiseRef = useRef<Promise<void> | null>(null);
  const generationRef = useRef(0);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const queryClient = useContext(QueryClientContext);
  const updateSession = (next: LoginResponse | null) => { sessionRef.current = next; setSession(next); };

  useEffect(() => {
    let active = true;
    const persisted = readPersistedAuthSession();
    if (!persisted) { setStatus("unauthenticated"); return () => { active = false; }; }
    void restore(persisted.refreshToken).then((tokens) => {
      if (!active || generationRef.current !== 0) return;
      const restored = { ...tokens, user: persisted.user, memberships: persisted.memberships };
      updateSession(restored); writePersistedAuthSession(restored); setStatus("authenticated");
    }).catch(() => { if (!active || generationRef.current !== 0) return; clearPersistedAuthSession(); updateSession(null); setStatus("unauthenticated"); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    configureUnauthorizedRecovery({
      recover: async (failedAccessToken) => {
        const current = sessionRef.current;
        if (!current) return null;
        if (current.accessToken !== failedAccessToken) return current.accessToken;
        let tokens;
        const generation = generationRef.current;
        try { tokens = await restore(current.refreshToken); } catch { if (generation === generationRef.current) { clearPersistedAuthSession(); updateSession(null); setStatus("unauthenticated"); } return null; }
        if (generation !== generationRef.current || !sessionRef.current) return null;
        const next = { ...tokens, user: current.user, memberships: current.memberships };
        updateSession(next); writePersistedAuthSession(next); setStatus("authenticated");
        return next.accessToken;
      },
    });
    return () => configureUnauthorizedRecovery(null);
  }, []);

  const establish = (next: LoginResponse) => { updateSession(next); writePersistedAuthSession(next); setStatus("authenticated"); };
  const logout = () => {
    if (logoutPromiseRef.current) return logoutPromiseRef.current;
    const generation = ++generationRef.current;
    setIsLoggingOut(true);
    const current = sessionRef.current;
    logoutPromiseRef.current = (async () => {
      try { if (current?.refreshToken) await revokeSession(current.refreshToken); } catch { /* local logout is authoritative */ }
      finally {
        if (generation === generationRef.current) { clearPersistedAuthSession(); updateSession(null); setStatus("unauthenticated"); queryClient?.clear(); setIsLoggingOut(false); }
        logoutPromiseRef.current = null;
      }
    })();
    return logoutPromiseRef.current;
  };

  const value: AuthContextValue = {
    session,
    isAuthenticated: session !== null,
    establishSession: establish,
    status,
    logout,
    isLoggingOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    return { session: null, isAuthenticated: false, establishSession: () => undefined, logout: async () => undefined, isLoggingOut: false, status: "unauthenticated" };
  }

  return context;
}
