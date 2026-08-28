import {
  createContext,
  useContext,
  useState,
  type PropsWithChildren,
} from "react";
import type { LoginResponse } from "../types/auth.types";

interface AuthContextValue {
  session: LoginResponse | null;
  isAuthenticated: boolean;
  establishSession: (session: LoginResponse) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<LoginResponse | null>(null);

  const value: AuthContextValue = {
    session,
    isAuthenticated: session !== null,
    establishSession: setSession,
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
