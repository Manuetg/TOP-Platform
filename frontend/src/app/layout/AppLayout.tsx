import { useLocation, useNavigate } from "react-router-dom";
import { useEffect, useRef } from "react";
import { ContextRail } from "../../shared/ui/ContextRail";
import { getContextRailContent } from "./contextRailContent";
import {
  AppShell,
  type AppNavigationTarget,
  type AppSection,
} from "./AppShell";
import { useAuth } from "../../features/auth/context/AuthContext";
import { useBusinessContext } from "../../features/business/context/BusinessContext";
import { BusinessBoundary } from "../../features/business/components/BusinessBoundary";
import { BusinessSelector } from "../../features/business/components/BusinessSelector";

import { PageErrorBoundary } from "../errors/PageErrorBoundary";

const sectionPaths: Record<AppSection, string> = {
  home: "/app",
  calendar: "/app/calendar",
  bookings: "/app/bookings",
  availability: "/app/availability",
  resources: "/app/resources",
  contacts: "/app/contacts",
  pricing: "/app/pricing",
  payments: "/app/payments",
  blocks: "/app/blocks",
  settings: "/app/settings",
};

function getActiveSection(pathname: string): AppSection {
  if (
    /^\/app\/bookings\/[^/]+\/payments\/?$/.test(
      pathname,
    )
  ) {
    return "payments";
  }

  const match = Object.entries(sectionPaths).find(
    ([section, path]) =>
      section !== "home" && pathname.startsWith(`${path}/`),
  );

  if (match) {
    return match[0] as AppSection;
  }

  const exactMatch = Object.entries(sectionPaths).find(
    ([, path]) => pathname === path,
  );

  return (exactMatch?.[0] as AppSection | undefined) ?? "home";
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout, isLoggingOut } = useAuth();
  const { activeBusiness, activeRole, status } = useBusinessContext();

  const activeSection = getActiveSection(location.pathname);
  const rail = status === "ready" ? getContextRailContent(location.pathname) : null;
  const previousPath = useRef(location.pathname);
  useEffect(() => {
    if (previousPath.current === location.pathname) return;
    previousPath.current = location.pathname;
    document.getElementById("top-main-content")?.focus({ preventScroll: true });
    const scrollingElement = document.scrollingElement ?? document.documentElement;
    scrollingElement.scrollTop = 0;
    scrollingElement.scrollLeft = 0;
  }, [location.pathname]);

  const handleNavigate = (target: AppNavigationTarget) => {
    if (target === "more") {
      return;
    }

    void navigate(sectionPaths[target]);
  };

  return (
    <AppShell
      activeSection={activeSection}
      renderBusinessMenu={(close) => <BusinessSelector onSelected={() => { close(); void navigate("/app", { replace: true }); }} />}
      contextRail={rail ? <ContextRail title="Para tener en cuenta" blocks={rail} /> : null}
      businessName={activeBusiness?.name ?? (status === "empty" ? "Sin negocio activo" : status === "error" ? "No disponible" : "Seleccioná un negocio")}
      userName={session?.user.email ?? "Usuario"}
      userRole={activeRole ?? "Sin rol"}
      onNavigate={handleNavigate}
      onSearchNavigate={(path) => { void navigate(path); }}
      onLogout={() => { void logout().finally(() => navigate("/login", { replace: true })); }}
      isLoggingOut={isLoggingOut}
    >
      <BusinessBoundary><PageErrorBoundary key={`${session?.user.id}:${activeBusiness?.id}`} /></BusinessBoundary>
    </AppShell>
  );
}

