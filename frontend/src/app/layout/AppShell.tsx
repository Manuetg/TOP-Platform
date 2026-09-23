import { GlobalSearch } from "../../features/search/components/GlobalSearch";
import {
  useRef,
  useEffect,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from "react";
import {
  BedDouble,
  Bell,
  Blocks,
  CalendarDays,
  ChevronDown,
  ContactRound,
  Gauge,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
import { OverlayPanel } from "../../shared/ui/OverlayPanel";
import { Button } from "../../shared/ui/Button";
import "./AppShell.css";

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
  renderBusinessMenu?: (close: () => void) => ReactNode;
  contextRail?: ReactNode;
  activeSection: AppSection;
  businessName: string;
  userName: string;
  userRole: string;
  onNavigate?: (target: AppNavigationTarget) => void;
  onBusinessMenuOpen?: () => void;
  onSearchNavigate?: (path: string) => void;
  onGlobalSearchChange?: (value: string) => void;
  onNotificationsOpen?: () => void;
  onProfileOpen?: () => void;
  onLogout?: () => void;
  isLoggingOut?: boolean;
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

const moreItems = [
  { id: "availability", label: "Disponibilidad", icon: Gauge },
  { id: "resources", label: "Recursos", icon: Hotel },
  { id: "contacts", label: "Contactos", icon: ContactRound },
  { id: "pricing", label: "Precios", icon: Tags },
  { id: "payments", label: "Pagos", icon: WalletCards },
  { id: "blocks", label: "Bloqueos", icon: Blocks },
  { id: "settings", label: "Configuración", icon: Settings },
] as const;

const moreSections: AppSection[] = moreItems.map((item) => item.id);

export function AppShell({
  activeSection,
  contextRail,
  renderBusinessMenu,
  businessName,
  userName,
  userRole,
  onNavigate,
  onBusinessMenuOpen,
  onGlobalSearchChange,
  onSearchNavigate,
  onNotificationsOpen,
  onProfileOpen,
  onLogout,
  isLoggingOut = false,
  children,
}: AppShellProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [headerState, setHeaderState] = useState<{ mode: "business" | "notifications" | "profile"; open: boolean }>({ mode: "profile", open: false });
  const headerMenu = headerState.open ? headerState.mode : null;
  const headerTrigger = useRef<HTMLElement | null>(null);
  const moreTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isMoreOpen || typeof window.matchMedia !== "function") return;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => {
      if (!desktop.matches) return;
      if (document.activeElement?.closest(".top-mobile-more-layer")) document.getElementById("top-main-content")?.focus();
      setIsMoreOpen(false);
    };
    desktop.addEventListener("change", closeOnDesktop);
    closeOnDesktop();
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, [isMoreOpen]);
  const toggleHeader = (mode: typeof headerState.mode, trigger: HTMLElement) => {
    headerTrigger.current = trigger;
    setIsMoreOpen(false);
    setHeaderState((current) => ({ mode, open: !current.open || current.mode !== mode }));
  };
  const closeHeader = () => setHeaderState((current) => ({ ...current, open: false }));
  const userInitials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const navigate = (target: AppNavigationTarget) => {
    if (target === "more") {
      closeHeader();
      setIsMoreOpen((current) => !current);
      return;
    }

    setIsMoreOpen(false);
    closeHeader();
    onNavigate?.(target);
  };

  return (
    <div className="top-app-shell">
      <a className="top-skip-link" href="#top-main-content">Ir al contenido</a>
      <aside
        className="top-sidebar"
        aria-label="Navegación principal"
      >
        <div className="top-sidebar__brand">
          TOP
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

        {activeSection === "home" && (
          <div className="top-sidebar-hospitality">
            <div className="top-sidebar-hospitality__art" aria-hidden="true"><Hotel size={42} strokeWidth={1.3} /></div>
            <strong>Haz crecer tu alojamiento con TOP</strong>
            <p>Más claridad para tu operación. Más tiempo para tus huéspedes.</p>
          </div>
        )}
        <div className="top-sidebar__footer">
          <ShellNavItem
            id="settings"
            label="Configuración"
            icon={Settings}
            activeSection={activeSection}
            onNavigate={navigate}
          />
        </div>
      </aside>

      <header className="top-global-header">
        <button
          type="button"
          className="top-global-header__business"
          aria-label="Cambiar negocio activo"
            aria-haspopup="dialog" aria-expanded={headerMenu === "business"}
          onClick={(event) => {
              onBusinessMenuOpen?.();
              toggleHeader("business", event.currentTarget);
            }}
        >
          <span
            className="top-global-header__business-icon"
            aria-hidden="true"
          >
            <Hotel size={20} />
          </span>

          <span className="top-global-header__business-copy">
            <span>Negocio activo</span>
            <strong>{businessName}</strong>
          </span>

          <ChevronDown
            className="top-global-header__chevron"
            size={17}
            aria-hidden="true"
          />
        </button>

        <div className="top-global-header__search-wrap">
          <GlobalSearch onModuleNavigate={navigate} onEntityNavigate={onSearchNavigate} onChange={onGlobalSearchChange} onOpen={closeHeader} menuOpen={headerMenu !== null} />
        </div>

        <div className="top-global-header__actions">
          <button
            type="button"
            className="top-global-header__icon-button"
            aria-label="Notificaciones"
            aria-haspopup="dialog" aria-expanded={headerMenu === "notifications"}
            onClick={(event) => {
              onNotificationsOpen?.();
              toggleHeader("notifications", event.currentTarget);
            }}
          >
            <Bell size={19} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="top-global-header__profile"
            aria-label="Abrir perfil"
            aria-haspopup="dialog" aria-expanded={headerMenu === "profile"}
            onClick={(event) => {
              onProfileOpen?.();
              toggleHeader("profile", event.currentTarget);
            }}
          >
            <span
              className="top-global-header__avatar"
              aria-hidden="true"
            >
              {userInitials || "TOP"}
            </span>

            <span className="top-global-header__profile-copy">
              <strong>{userName}</strong>
              <span>{userRole}</span>
            </span>

            <ChevronDown
              className="top-global-header__profile-chevron"
              size={16}
              aria-hidden="true"
            />
          </button>
        </div>
      </header>
      <header className="top-mobile-header">
        <div className="top-mobile-header__top">
          <span className="top-mobile-header__brand">
            TOP
          </span>

          <div className="top-mobile-header__actions">
            <button
              type="button"
              className="top-mobile-header__icon-button"
              aria-label="Notificaciones"
            aria-haspopup="dialog" aria-expanded={headerMenu === "notifications"}
              onClick={(event) => {
              onNotificationsOpen?.();
              toggleHeader("notifications", event.currentTarget);
            }}
            >
              <Bell size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="top-mobile-header__avatar-button"
              aria-label="Abrir perfil"
            aria-haspopup="dialog" aria-expanded={headerMenu === "profile"}
              onClick={(event) => {
              onProfileOpen?.();
              toggleHeader("profile", event.currentTarget);
            }}
            >
              <span aria-hidden="true">
                {userInitials || "TOP"}
              </span>
            </button>
          </div>
        </div>

        <button
          type="button"
          className="top-mobile-header__business-selector"
          aria-label="Cambiar negocio activo"
            aria-haspopup="dialog" aria-expanded={headerMenu === "business"}
          onClick={(event) => {
              onBusinessMenuOpen?.();
              toggleHeader("business", event.currentTarget);
            }}
        >
          <span
            className="top-mobile-header__business-icon"
            aria-hidden="true"
          >
            <Hotel size={19} />
          </span>

          <span className="top-mobile-header__business-copy">
            <span>Negocio activo</span>
            <strong>{businessName}</strong>
          </span>

          <ChevronDown size={17} aria-hidden="true" />
        </button>

        <GlobalSearch variant="mobile" onModuleNavigate={navigate} onEntityNavigate={onSearchNavigate} onChange={onGlobalSearchChange} onOpen={closeHeader} menuOpen={headerMenu !== null} />
      </header>


      <OverlayPanel open={headerState.open} label="Panel del encabezado" closeLabel="Cerrar panel del encabezado" triggerRef={headerTrigger} onClose={closeHeader}
        layerClassName={`top-header-popover-layer${headerState.mode === "business" ? " top-header-popover-layer--business" : ""}`}
        className={`top-header-popover${headerState.mode === "business" ? " top-header-popover--business" : ""}`}>
            <Button variant="tertiary" size="sm" iconOnly aria-label="Cerrar panel del encabezado" className="top-panel-close" onClick={() => { headerTrigger.current?.focus(); closeHeader(); }}><X size={20} aria-hidden="true" /></Button>            {headerState.mode === "business" && renderBusinessMenu ? <><div className="top-header-popover__heading"><span>Establecimientos</span><strong>Tu negocio activo</strong></div>{renderBusinessMenu(() => { headerTrigger.current?.focus(); closeHeader(); })}</> : headerState.mode === "business" ? (
              <>
                <div className="top-header-popover__heading">
                  <span>Establecimiento</span>
                  <strong>Negocio activo</strong>
                </div>

                <div className="top-header-popover__business-current">
                  <span className="top-header-popover__business-icon">
                    <Hotel size={20} aria-hidden="true" />
                  </span>

                  <div>
                    <strong>{businessName}</strong>
                    <span>Negocio seleccionado actualmente</span>
                  </div>
                </div>
              </>
            ) : headerState.mode === "notifications" ? (
              <>
                <div className="top-header-popover__heading">
                  <span>Actividad</span>
                  <strong>Notificaciones</strong>
                </div>

                <div className="top-header-popover__empty">
                  <Bell size={20} aria-hidden="true" />
                  <strong>Todo al día</strong>
                  <span>No tenés notificaciones nuevas.</span>
                </div>
              </>
            ) : (
              <>
                <div className="top-header-popover__heading">
                  <span>Cuenta</span>
                  <strong>{userName}</strong>
                </div>

                <div className="top-header-popover__profile-summary">
                  <span className="top-header-popover__avatar">
                    {userInitials || "TOP"}
                  </span>

                  <div>
                    <strong>{userName}</strong>
                    <span>{userRole}</span>
                  </div>
                </div>

                <div className="top-header-popover__list">
                  <button
                    type="button"
                    className="top-header-popover__item"
                    onClick={() => navigate("settings")}
                  >
                    <Settings size={18} aria-hidden="true" />
                    <span>Configuración</span>
                  </button>
                  <button type="button" className="top-header-popover__item top-header-popover__item--danger" onClick={onLogout} disabled={isLoggingOut}>
                    <LogOut size={18} aria-hidden="true" />
                    <span>{isLoggingOut ? "Cerrando sesión..." : "Cerrar sesión"}</span>
                  </button>
                </div>
              </>
            )}
      </OverlayPanel>

      <div className={`top-app-shell__body${contextRail ? " top-app-shell__body--with-rail" : ""}`}>
        <main id="top-main-content" tabIndex={-1} className="top-app-shell__content">{children}</main>
        {contextRail}
      </div>

      <OverlayPanel open={isMoreOpen} label="Más opciones" closeLabel="Cerrar menú Más al tocar fuera" triggerRef={moreTrigger}
        onClose={() => setIsMoreOpen(false)} layerClassName="top-mobile-more-layer" className="top-mobile-more-sheet">
            <div
              className="top-mobile-more-sheet__handle"
              aria-hidden="true"
            />

            <div className="top-mobile-more-sheet__header">
              <div>
                <span>Menú</span>
                <strong>Más opciones</strong>
              </div>

              <button
                type="button"
                className="top-mobile-more-sheet__close"
                aria-label="Cerrar menú Más"
                onClick={() => { moreTrigger.current?.focus(); setIsMoreOpen(false); }}
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="top-mobile-more-sheet__items">
              {moreItems.map((item) => {
                const Icon = item.icon;
                const isActive =
                  activeSection === item.id;

                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`top-mobile-more-sheet__item${
                      isActive ? " is-active" : ""
                    }`}
                    aria-current={
                      isActive ? "page" : undefined
                    }
                    onClick={() => navigate(item.id)}
                  >
                    <span className="top-mobile-more-sheet__item-icon">
                      <Icon
                        size={20}
                        aria-hidden="true"
                      />
                    </span>

                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
      </OverlayPanel>

      <nav
        className="top-bottom-nav"
        aria-label="Navegación principal"
      >
        {mobileItems.map((item) => {
          const Icon = item.icon;

          const isActive =
            item.id === "more"
              ? moreSections.includes(activeSection)
              : activeSection === item.id;

          return (
            <button
              key={item.id}
              ref={item.id === "more" ? moreTrigger : undefined}
              type="button"
              className={`top-bottom-nav__item${
                isActive ? " is-active" : ""
              }`}
              aria-current={
                isActive ? "page" : undefined
              }
              aria-expanded={
                item.id === "more"
                  ? isMoreOpen
                  : undefined
              }
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

interface ShellNavGroupProps
  extends PropsWithChildren {
  label: string;
}

function ShellNavGroup({
  label,
  children,
}: ShellNavGroupProps) {
  return (
    <div className="top-sidebar__group">
      <span className="top-sidebar__group-label">
        {label}
      </span>

      <div className="top-sidebar__group-items">
        {children}
      </div>
    </div>
  );
}

interface ShellNavItemProps {
  id: AppSection;
  label: string;
  icon: typeof LayoutDashboard;
  activeSection: AppSection;
  onNavigate: (
    target: AppNavigationTarget,
  ) => void;
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
      className={`top-sidebar__nav-item${
        isActive ? " is-active" : ""
      }`}
      aria-current={
        isActive ? "page" : undefined
      }
      onClick={() => onNavigate(id)}
    >
      <Icon size={20} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}
