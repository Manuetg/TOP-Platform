import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { AuthUser, LoginResponse } from "../types/auth.types";
import { refreshSession } from "../api/refresh-session";
import { clearPersistedAuthSession, readPersistedAuthSession, writePersistedAuthSession, type AuthPersistenceMode } from "../storage/auth-session-storage";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { logout as revokeSession } from "../api/logout";
import { QueryClientContext } from "@tanstack/react-query";
import { clearFinanceIntentMemory } from "../../finance/v2/use-finance-intent";

export type AuthStatus = "restoring" | "authenticated" | "unauthenticated";
const restores = new Map<string, ReturnType<typeof refreshSession>>();
function restore(refreshToken: string) {
  const pending = restores.get(refreshToken);
  if (pending) return pending;
  const promise = refreshSession(refreshToken).finally(() => {
    if (restores.get(refreshToken) === promise) restores.delete(refreshToken);
  });
  restores.set(refreshToken, promise);
  return promise;
}

interface AuthContextValue {
  session: LoginResponse | null;
  isAuthenticated: boolean;
  establishSession: (session: LoginResponse, mode?: AuthPersistenceMode) => void;
  updateUserProfile: (user: AuthUser) => boolean;
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
  const persistenceModeRef = useRef<AuthPersistenceMode>("SESSION");
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
      persistenceModeRef.current = persisted.mode;
      updateSession(restored); writePersistedAuthSession(restored, persisted.mode); setStatus("authenticated");
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
        const latest = sessionRef.current;
        if (generation !== generationRef.current || !latest) return null;
        const next = { ...tokens, user: latest.user, memberships: latest.memberships };
        updateSession(next); writePersistedAuthSession(next, persistenceModeRef.current); setStatus("authenticated");
        return next.accessToken;
      },
    });
    return () => configureUnauthorizedRecovery(null);
  }, []);

  const establish = (next: LoginResponse, mode: AuthPersistenceMode = "SESSION") => { ++generationRef.current; persistenceModeRef.current = mode; updateSession(next); writePersistedAuthSession(next, mode); setStatus("authenticated"); };
  // Keep the callback captured before an asynchronous profile request. A new
  // login, even for the same user, must not accept that request's old response.
  const profileGeneration = generationRef.current;
  const updateUserProfile = (user: AuthUser): boolean => {
    const current = sessionRef.current;
    if (!current || current.user.id !== user.id || profileGeneration !== generationRef.current || user.displayName === undefined) return false;
    const next = { ...current, user: { ...current.user, displayName: user.displayName } };
    updateSession(next);
    writePersistedAuthSession(next, persistenceModeRef.current);
    return true;
  };
  const logout = () => {
    if (logoutPromiseRef.current) return logoutPromiseRef.current;
    clearFinanceIntentMemory();
    ++generationRef.current;
    setIsLoggingOut(true);
    const current = sessionRef.current;
    clearPersistedAuthSession();
    updateSession(null);
    setStatus("unauthenticated");
    queryClient?.clear();
    logoutPromiseRef.current = (async () => {
      try { if (current?.refreshToken) await revokeSession(current.refreshToken); } catch { /* local logout is authoritative */ }
      finally {
        setIsLoggingOut(false);
        logoutPromiseRef.current = null;
      }
    })();
    return logoutPromiseRef.current;
  };

  const value: AuthContextValue = {
    session,
    isAuthenticated: session !== null,
    establishSession: establish,
    updateUserProfile,
    status,
    logout,
    isLoggingOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    return { session: null, isAuthenticated: false, establishSession: () => undefined, updateUserProfile: () => false, logout: async () => undefined, isLoggingOut: false, status: "unauthenticated" };
  }

  return context;
}
