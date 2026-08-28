import type { PropsWithChildren } from "react";
import {
  BedDouble,
  Blocks,
  CalendarDays,
  ContactRound,
  Gauge,
  Hotel,
  LayoutDashboard,
  Menu,
  Tags,
  Settings,
  WalletCards,
} from "lucide-react";

export type AppSection =
  | "home"
  | "calendar"
  | "bookings"
  | "availability"
  | "resources"
  | "contacts"
  | "pricing"
  | "payments"
  | "blocks"
  | "settings";

export type AppNavigationTarget = AppSection | "more";

interface AppShellProps extends PropsWithChildren {
  activeSection: AppSection;
  businessName: string;
  userName: string;
  userRole: string;
  onNavigate?: (target: AppNavigationTarget) => void;
}

const operationItems = [
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "bookings", label: "Reservas", icon: BedDouble },
  { id: "availability", label: "Disponibilidad", icon: Gauge },
] as const;

const managementItems = [
  { id: "resources", label: "Recursos", icon: Hotel },
  { id: "contacts", label: "Contactos", icon: ContactRound },
  { id: "pricing", label: "Precios", icon: Tags },
  { id: "payments", label: "Pagos", icon: WalletCards },
  { id: "blocks", label: "Bloqueos", icon: Blocks },
] as const;

const mobileItems = [
  { id: "home", label: "Inicio", icon: LayoutDashboard },
  { id: "calendar", label: "Calendario", icon: CalendarDays },
  { id: "bookings", label: "Reservas", icon: BedDouble },
  { id: "more", label: "Más", icon: Menu },
] as const;

const moreSections: AppSection[] = [
  "availability",
  "resources",
  "contacts",
  "pricing",
  "payments",
  "blocks",
  "settings",
];

export function AppShell({
  activeSection,
  businessName,
  userName,
  userRole,
  onNavigate,
  children,
}: AppShellProps) {
  const navigate = (target: AppNavigationTarget) => {
    onNavigate?.(target);
  };

  return (
    <div className="top-app-shell">
      <aside className="top-sidebar" aria-label="Navegación principal">
        <div className="top-sidebar__brand">TOP</div>

        <div className="top-sidebar__business">
          <span className="top-sidebar__business-label">Negocio activo</span>
          <strong className="top-sidebar__business-name">{businessName}</strong>
        </div>

        <nav className="top-sidebar__nav">
          <ShellNavItem
            id="home"
            label="Inicio"
            icon={LayoutDashboard}
            activeSection={activeSection}
            onNavigate={navigate}
          />

          <ShellNavGroup label="Operación">
            {operationItems.map((item) => (
              <ShellNavItem
                key={item.id}
                {...item}
                activeSection={activeSection}
                onNavigate={navigate}
              />
            ))}
          </ShellNavGroup>

          <ShellNavGroup label="Gestión">
            {managementItems.map((item) => (
              <ShellNavItem
                key={item.id}
                {...item}
                activeSection={activeSection}
                onNavigate={navigate}
              />
            ))}
          </ShellNavGroup>
        </nav>

        <div className="top-sidebar__footer">
          <ShellNavItem
            id="settings"
            label="Configuración"
            icon={Settings}
            activeSection={activeSection}
            onNavigate={navigate}
          />

          <div className="top-sidebar__user">
            <strong>{userName}</strong>
            <span>{userRole}</span>
          </div>
        </div>
      </aside>

      <div className="top-mobile-header">
        <span className="top-mobile-header__brand">TOP</span>

        <div className="top-mobile-header__business">
          <span>Negocio activo</span>
          <strong>{businessName}</strong>
        </div>
      </div>

      <main className="top-app-shell__content">{children}</main>

      <nav className="top-bottom-nav" aria-label="Navegación principal">
        {mobileItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.id === "more"
              ? moreSections.includes(activeSection)
              : activeSection === item.id;

          return (
            <button
              key={item.id}
              type="button"
              className={`top-bottom-nav__item${isActive ? " is-active" : ""}`}
              aria-current={isActive ? "page" : undefined}
              onClick={() => navigate(item.id)}
            >
              <Icon size={20} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}

interface ShellNavGroupProps extends PropsWithChildren {
  label: string;
}

function ShellNavGroup({ label, children }: ShellNavGroupProps) {
  return (
    <div className="top-sidebar__group">
      <span className="top-sidebar__group-label">{label}</span>
      <div className="top-sidebar__group-items">{children}</div>
    </div>
  );
}

interface ShellNavItemProps {
  id: AppSection;
  label: string;
  icon: typeof LayoutDashboard;
  activeSection: AppSection;
  onNavigate: (target: AppNavigationTarget) => void;
}

function ShellNavItem({
  id,
  label,
  icon: Icon,
  activeSection,
  onNavigate,
}: ShellNavItemProps) {
  const isActive = activeSection === id;

  return (
    <button
      type="button"
      className={`top-sidebar__nav-item${isActive ? " is-active" : ""}`}
      aria-current={isActive ? "page" : undefined}
      onClick={() => onNavigate(id)}
    >
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
