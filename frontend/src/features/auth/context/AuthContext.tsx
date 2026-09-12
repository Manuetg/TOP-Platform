import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from "react";
import type { LoginResponse } from "../types/auth.types";
import { refreshSession } from "../api/refresh-session";
import { clearPersistedAuthSession, readPersistedAuthSession, writePersistedAuthSession } from "../storage/auth-session-storage";

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
  status: AuthStatus;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<LoginResponse | null>(null);
  const [status, setStatus] = useState<AuthStatus>("restoring");

  useEffect(() => {
    let active = true;
    const persisted = readPersistedAuthSession();
    if (!persisted) { setStatus("unauthenticated"); return () => { active = false; }; }
    void restore(persisted.refreshToken).then((tokens) => {
      if (!active) return;
      const restored = { ...tokens, user: persisted.user, memberships: persisted.memberships };
      setSession(restored); writePersistedAuthSession(restored); setStatus("authenticated");
    }).catch(() => { if (!active) return; clearPersistedAuthSession(); setSession(null); setStatus("unauthenticated"); });
    return () => { active = false; };
  }, []);

  const establish = (next: LoginResponse) => { setSession(next); writePersistedAuthSession(next); setStatus("authenticated"); };

  const value: AuthContextValue = {
    session,
    isAuthenticated: session !== null,
    establishSession: establish,
    status,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth debe utilizarse dentro de AuthProvider.");
  }

  return context;
}
