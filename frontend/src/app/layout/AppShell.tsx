import {
  useEffect,
  useState,
  type PropsWithChildren,
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
  Menu,
  Settings,
  Search,
  Tags,
  WalletCards,
  X,
} from "lucide-react";
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
  activeSection: AppSection;
  businessName: string;
  userName: string;
  userRole: string;
  onNavigate?: (target: AppNavigationTarget) => void;
  onBusinessMenuOpen?: () => void;
  onGlobalSearchChange?: (value: string) => void;
  onNotificationsOpen?: () => void;
  onProfileOpen?: () => void;
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

const searchableItems = [
  { id: "home", label: "Inicio" },
  { id: "calendar", label: "Calendario" },
  { id: "bookings", label: "Reservas" },
  { id: "availability", label: "Disponibilidad" },
  { id: "resources", label: "Recursos" },
  { id: "contacts", label: "Contactos" },
  { id: "pricing", label: "Precios" },
  { id: "payments", label: "Pagos" },
  { id: "blocks", label: "Bloqueos" },
  { id: "settings", label: "Configuración" },
] satisfies Array<{
  id: AppSection;
  label: string;
}>;

export function AppShell({
  activeSection,
  businessName,
  userName,
  userRole,
  onNavigate,
  onBusinessMenuOpen,
  onGlobalSearchChange,
  onNotificationsOpen,
  onProfileOpen,
  children,
}: AppShellProps) {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [headerMenu, setHeaderMenu] = useState<
    "business" | "notifications" | "profile" | null
  >(null);

  const userInitials = userName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  const normalizedSearch = searchQuery.trim().toLocaleLowerCase("es");

  const searchResults = normalizedSearch
    ? searchableItems.filter((item) =>
        item.label.toLocaleLowerCase("es").includes(normalizedSearch),
      )
    : [];

  useEffect(() => {
    if (!isMoreOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMoreOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMoreOpen]);

  const navigate = (target: AppNavigationTarget) => {
    if (target === "more") {
      setIsMoreOpen((current) => !current);
      return;
    }

    setIsMoreOpen(false);
    onNavigate?.(target);
  };

  return (
    <div className="top-app-shell">
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
          onClick={() => {
            onBusinessMenuOpen?.();
            setHeaderMenu((current) =>
              current === "business" ? null : "business",
            );
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
          <label className="top-global-header__search">
            <Search size={18} aria-hidden="true" />

            <input
              type="search"
              aria-label="Buscar en TOP"
              placeholder="Buscar en TOP..."
              value={searchQuery}
              onChange={(event) => {
                const value = event.target.value;
                setSearchQuery(value);
                setHeaderMenu(null);
                onGlobalSearchChange?.(value);
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  searchResults.length > 0
                ) {
                  navigate(searchResults[0].id);
                }

                if (event.key === "Escape") {
                  setSearchQuery("");
                }
              }}
            />
          </label>
        </div>

        <div className="top-global-header__actions">
          <button
            type="button"
            className="top-global-header__icon-button"
            aria-label="Notificaciones"
            onClick={() => {
              onNotificationsOpen?.();
              setHeaderMenu((current) =>
                current === "notifications"
                  ? null
                  : "notifications",
              );
            }}
          >
            <Bell size={19} aria-hidden="true" />
          </button>

          <button
            type="button"
            className="top-global-header__profile"
            aria-label="Abrir perfil"
            onClick={() => {
              onProfileOpen?.();
              setHeaderMenu((current) =>
                current === "profile" ? null : "profile",
              );
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
              onClick={() => {
              onNotificationsOpen?.();
              setHeaderMenu((current) =>
                current === "notifications"
                  ? null
                  : "notifications",
              );
            }}
            >
              <Bell size={20} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="top-mobile-header__avatar-button"
              aria-label="Abrir perfil"
              onClick={() => {
              onProfileOpen?.();
              setHeaderMenu((current) =>
                current === "profile" ? null : "profile",
              );
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
          onClick={() => {
            onBusinessMenuOpen?.();
            setHeaderMenu((current) =>
              current === "business" ? null : "business",
            );
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

        <label className="top-mobile-header__search">
          <Search size={18} aria-hidden="true" />

          <input
            type="search"
            aria-label="Buscar en TOP"
            placeholder="Buscar en TOP..."
            value={searchQuery}
            onChange={(event) => {
              const value = event.target.value;
              setSearchQuery(value);
              setHeaderMenu(null);
              onGlobalSearchChange?.(value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                searchResults.length > 0
              ) {
                navigate(searchResults[0].id);
              }

              if (event.key === "Escape") {
                setSearchQuery("");
              }
            }}
          />
        </label>
      </header>


      {(headerMenu !== null || searchQuery.trim().length > 0) && (
        <div
          className={`top-header-popover-layer${searchQuery.trim().length > 0 ? " top-header-popover-layer--search" : headerMenu === "business" ? " top-header-popover-layer--business" : ""}`}
        >
          <button
            type="button"
            className="top-header-popover-backdrop"
            aria-label="Cerrar panel del encabezado"
            onClick={() => {
              setHeaderMenu(null);
              setSearchQuery("");
            }}
          />

          <section
            className={`top-header-popover${searchQuery.trim().length > 0 ? " top-header-popover--search" : headerMenu === "business" ? " top-header-popover--business" : ""}`}
            aria-label="Panel del encabezado"
          >
            {searchQuery.trim().length > 0 ? (
              <>
                <div className="top-header-popover__heading">
                  <span>Búsqueda</span>
                  <strong>Resultados</strong>
                </div>

                {searchResults.length > 0 ? (
                  <div className="top-header-popover__list">
                    {searchResults.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="top-header-popover__item"
                        onClick={() => navigate(item.id)}
                      >
                        <Search size={18} aria-hidden="true" />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="top-header-popover__empty">
                    <Search size={20} aria-hidden="true" />
                    <strong>Sin resultados</strong>
                    <span>
                      No encontramos un módulo con ese nombre.
                    </span>
                  </div>
                )}
              </>
            ) : headerMenu === "business" ? (
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
            ) : headerMenu === "notifications" ? (
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
                </div>
              </>
            )}
          </section>
        </div>
      )}

      <main className="top-app-shell__content">
        {children}
      </main>

      {isMoreOpen && (
        <div className="top-mobile-more-layer">
          <button
            type="button"
            className="top-mobile-more-backdrop"
            aria-label="Cerrar menú Más al tocar fuera"
            onClick={() => setIsMoreOpen(false)}
          />

          <section
            className="top-mobile-more-sheet"
            role="region"
            aria-label="Más opciones"
          >
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
                onClick={() => setIsMoreOpen(false)}
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
          </section>
        </div>
      )}

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
