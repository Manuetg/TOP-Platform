import { Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../../features/auth/context/AuthContext";
import { useBusinessContext } from "../../features/business/context/BusinessContext";
import { ErrorBoundary } from "../../shared/ui/ErrorBoundary";
import { ErrorFallback } from "./ErrorFallback";

export function PageErrorBoundary() {
  const location = useLocation();
  const { session } = useAuth();
  const { activeBusinessId } = useBusinessContext();
  const resetKey = JSON.stringify([location.key, session?.user.id, activeBusinessId]);
  return (
    <ErrorBoundary resetKey={resetKey} fallback={(retry) => <ErrorFallback retry={retry} />}>
      <Outlet />
    </ErrorBoundary>
  );
}
