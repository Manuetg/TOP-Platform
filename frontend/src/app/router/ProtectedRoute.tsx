import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/context/AuthContext";
import type { ReactNode } from "react";

export function ProtectedRoute({ children }: { children?: ReactNode }) {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "restoring") return <main aria-live="polite" className="auth-route-loading">Cargando sesión...</main>;
  if (status === "unauthenticated") {
    const destination = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?next=${encodeURIComponent(destination)}`} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}

export function PublicRoute() {
  const { status } = useAuth();
  const location = useLocation();
  if (status === "restoring") return <main aria-live="polite" className="auth-route-loading">Cargando sesión...</main>;
  if (status === "authenticated") {
    const next = new URLSearchParams(location.search).get("next");
    return <Navigate to={next?.startsWith("/app") ? next : "/app"} replace />;
  }
  return <Outlet />;
}
