import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  type AppNavigationTarget,
  type AppSection,
} from "./AppShell";
import { useAuth } from "../../features/auth/context/AuthContext";
import { useBusinessContext } from "../../features/business/context/BusinessContext";

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
  const { logout, isLoggingOut } = useAuth();
  const { activeBusiness, activeRole } = useBusinessContext();

  const activeSection = getActiveSection(location.pathname);

  const handleNavigate = (target: AppNavigationTarget) => {
    if (target === "more") {
      return;
    }

    void navigate(sectionPaths[target]);
  };

  return (
    <AppShell
      activeSection={activeSection}
      businessName={activeBusiness?.name ?? (activeBusiness ? activeBusiness.name : "Seleccioná un negocio")}
      userName={useAuth().session?.user.email ?? "Usuario"}
      userRole={activeRole ?? "Rol"}
      onNavigate={handleNavigate}
      onLogout={() => { void logout().finally(() => navigate("/login", { replace: true })); }}
      isLoggingOut={isLoggingOut}
    >
      <Outlet />
    </AppShell>
  );
}

