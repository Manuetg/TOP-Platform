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
import { TopBreadcrumb } from "../../shared/ui/TopBreadcrumb";
import type { TopBreadcrumbItem } from "../../shared/ui/TopBreadcrumb";
import {
  BedDouble,
  Blocks,
  CalendarDays,
  ContactRound,
  Gauge,
  Hotel,
  Settings,
  Tags,
  WalletCards,
} from "lucide-react";

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

const breadcrumbSections: Record<
  string,
  { label: string; icon: TopBreadcrumbItem["icon"] }
> = {
  calendar: { label: "Calendario", icon: CalendarDays },
  bookings: { label: "Reservas", icon: BedDouble },
  availability: { label: "Disponibilidad", icon: Gauge },
  resources: { label: "Recursos", icon: Hotel },
  contacts: { label: "Contactos", icon: ContactRound },
  pricing: { label: "Precios", icon: Tags },
  payments: { label: "Pagos", icon: WalletCards },
  blocks: { label: "Bloqueos", icon: Blocks },
  settings: { label: "Configuración", icon: Settings },
};

function getBreadcrumbItems(pathname: string): readonly TopBreadcrumbItem[] | null {
  const normalizedPath = pathname.replace(/\/+$/, "") || "/app";

  if (normalizedPath === "/app") {
    return [{ label: "Inicio", current: true }];
  }

  const parts = normalizedPath.replace(/^\/app\/?/, "").split("/");
  const section = breadcrumbSections[parts[0]];

  if (!section) {
    return null;
  }

  const items: TopBreadcrumbItem[] = [
    { label: "Inicio", href: "/app" },
    {
      label: section.label,
      href: `/app/${parts[0]}`,
      icon: section.icon,
      current: parts.length === 1,
    },
  ];

  if (parts.length === 1) {
    return items;
  }

  const terminal = parts[parts.length - 1];
  const labels: Record<string, string> = {
    new: parts[0] === "bookings" ? "Nueva reserva" : `Nuevo ${parts[0] === "resources" ? "recurso" : parts[0] === "contacts" ? "contacto" : parts[0] === "blocks" ? "bloqueo" : "plan"}`,
    edit: `Editar ${parts[0] === "bookings" ? "reserva" : parts[0] === "resources" ? "recurso" : parts[0] === "contacts" ? "contacto" : "plan"}`,
    rules: "Reglas de disponibilidad",
    payments: "Pagos de la reserva",
    confirm: "Confirmar reserva",
    seasons: "Temporadas",
    preview: "Vista previa",
  };

  let currentLabel = labels[terminal] ?? "Detalle";
  if (parts[0] === "availability" && terminal === "rules") {
    currentLabel = "Reglas de disponibilidad";
  }

  items[1] = { ...items[1], href: `/app/${parts[0]}` };
  items.push({ label: currentLabel, current: true });
  return items;
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { session, logout, isLoggingOut } = useAuth();
  const { activeBusiness, activeRole, status } = useBusinessContext();
  const userDisplayName = typeof session?.user.displayName === "string" ? session.user.displayName.trim() : "";

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
      userName={userDisplayName || session?.user.email || "Usuario"}
      userEmail={session?.user.email}
      userRole={activeRole ?? "Sin rol"}
      onNavigate={handleNavigate}
      onSearchNavigate={(path) => { void navigate(path); }}
      onLogout={() => { void logout().finally(() => navigate("/login", { replace: true })); }}
      isLoggingOut={isLoggingOut}
      breadcrumb={
        /^\/app\/resources\/[^/]+\/?$/.test(location.pathname)
          ? null
          : (() => {
              const items = getBreadcrumbItems(location.pathname);
              return items ? <TopBreadcrumb items={items} /> : null;
            })()
      }
    >
      <BusinessBoundary><PageErrorBoundary key={`${session?.user.id}:${activeBusiness?.id}`} /></BusinessBoundary>
    </AppShell>
  );
}

