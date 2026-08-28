import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AppShell,
  type AppNavigationTarget,
  type AppSection,
} from "./AppShell";

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
      businessName="Negocio"
      userName="Usuario"
      userRole="Rol"
      onNavigate={handleNavigate}
    >
      <Outlet />
    </AppShell>
  );
}

