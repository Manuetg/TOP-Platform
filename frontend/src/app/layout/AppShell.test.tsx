import { QueryProvider } from "../providers/QueryProvider";
import type { ReactElement } from "react";
import { act, render as rtlRender, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 100, y: 20, top: 20, left: 100, right: 300, bottom: 64, width: 200, height: 44, toJSON: () => ({}) });
  });
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it("starts with an expanded desktop sidebar when no preference exists", () => {
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria"><div /></AppShell>);

    expect(document.querySelector(".top-sidebar")).not.toHaveClass("is-collapsed");
    expect(screen.getByRole("button", { name: "Contraer barra lateral" })).toBeVisible();
  });

  it("toggles and persists the desktop sidebar preference", async () => {
    const user = userEvent.setup();
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria"><div /></AppShell>);

    await user.click(screen.getByRole("button", { name: "Contraer barra lateral" }));
    expect(document.querySelector(".top-sidebar")).toHaveClass("is-collapsed");
    expect(localStorage.getItem("top.sidebar.collapsed.v1")).toBe("true");
    expect(screen.getByRole("button", { name: "Expandir barra lateral" })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Expandir barra lateral" }));
    expect(document.querySelector(".top-sidebar")).not.toHaveClass("is-collapsed");
    expect(localStorage.getItem("top.sidebar.collapsed.v1")).toBe("false");
  });

  it("restores a collapsed sidebar from localStorage without losing accessible navigation names", () => {
    localStorage.setItem("top.sidebar.collapsed.v1", "true");
    render(<AppShell activeSection="bookings" businessName="Tobera" userName="Jeni" userRole="Propietaria"><div /></AppShell>);

    const sidebar = document.querySelector(".top-sidebar") as HTMLElement;
    expect(sidebar).toHaveClass("is-collapsed");
    expect(within(sidebar).getByRole("button", { name: "Calendario" })).toBeInTheDocument();
    expect(within(sidebar).getByRole("button", { name: "Reservas", current: "page" })).toBeInTheDocument();
  });

  it("removes the hospitality promo from the collapsed sidebar", () => {
    localStorage.setItem("top.sidebar.collapsed.v1", "true");
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria"><div /></AppShell>);

    expect(screen.queryByText("Haz crecer tu alojamiento con TOP")).not.toBeInTheDocument();
  });

  it("shows business and user context", () => {
    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <h1>Contenido</h1>
      </AppShell>,
    );

    expect(screen.getAllByText("Tobera")).toHaveLength(2);
    expect(screen.getByText("Jeni")).toBeInTheDocument();
    expect(screen.getByText("Propietaria")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Contenido" })).toBeInTheDocument();
  });

  it.each(["user", "leaf", "sun", "mountain"] as const)(
    "shows the %s avatar in the desktop, mobile and profile panel slots",
    async (avatarId) => {
      const user = userEvent.setup();
      render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" userAvatarId={avatarId}><div /></AppShell>);

      const desktopHeader = document.querySelector(".top-global-header") as HTMLElement;
      const mobileHeader = document.querySelector(".top-mobile-header") as HTMLElement;
      const desktopTrigger = within(desktopHeader).getByRole("button", { name: "Abrir perfil" });
      const mobileTrigger = within(mobileHeader).getByRole("button", { name: "Abrir perfil" });

      expect(desktopTrigger.querySelector("[data-profile-avatar]")).toHaveAttribute("data-profile-avatar", avatarId);
      expect(mobileTrigger.querySelector("[data-profile-avatar]")).toHaveAttribute("data-profile-avatar", avatarId);
      expect(desktopTrigger).toHaveAttribute("aria-haspopup", "dialog");
      expect(mobileTrigger).toHaveAttribute("aria-haspopup", "dialog");

      await user.click(desktopTrigger);
      const panel = screen.getByRole("dialog", { name: "Panel del encabezado" });
      expect(panel.querySelector(".top-header-popover__avatar [data-profile-avatar]")).toHaveAttribute("data-profile-avatar", avatarId);
      expect(within(panel).getByRole("button", { name: "Configuración" })).toBeInTheDocument();
    },
  );

  it.each([null, undefined])(
    "keeps initials in every avatar slot when the supplied avatar is %s",
    async (avatarId) => {
      const user = userEvent.setup();
      render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" userAvatarId={avatarId}><div /></AppShell>);

      const desktopHeader = document.querySelector(".top-global-header") as HTMLElement;
      const mobileHeader = document.querySelector(".top-mobile-header") as HTMLElement;
      const desktopTrigger = within(desktopHeader).getByRole("button", { name: "Abrir perfil" });
      const mobileTrigger = within(mobileHeader).getByRole("button", { name: "Abrir perfil" });
      expect(desktopTrigger.querySelector(".top-global-header__avatar")).toHaveTextContent(/^J$/);
      expect(mobileTrigger.querySelector('span[aria-hidden="true"]')).toHaveTextContent(/^J$/);

      await user.click(mobileTrigger);
      const panel = screen.getByRole("dialog", { name: "Panel del encabezado" });
      expect(panel.querySelector(".top-header-popover__avatar")).toHaveTextContent(/^J$/);
      expect(document.querySelector("[data-profile-avatar]")).not.toBeInTheDocument();
    },
  );

  it.each([
    ["desktop", ".top-global-header", 64],
    ["mobile", ".top-mobile-header", 116],
  ] as const)(
    "anchors the avatar panel to its %s trigger and restores that trigger on Escape",
    async (_viewport, headerSelector, anchorBottom) => {
      const user = userEvent.setup();
      render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" userAvatarId="leaf"><div /></AppShell>);
      const header = document.querySelector(headerSelector) as HTMLElement;
      const trigger = within(header).getByRole("button", { name: "Abrir perfil" });
      const measureAnchor = vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (this: HTMLElement) {
        const bottom = this === trigger ? anchorBottom : 64;
        return {
          x: 100, y: bottom - 44, top: bottom - 44, left: 100,
          right: 300, bottom, width: 200, height: 44, toJSON: () => ({}),
        };
      });

      await user.click(trigger);
      const panel = screen.getByRole("dialog", { name: "Panel del encabezado" });
      expect(measureAnchor.mock.contexts).toContain(trigger);
      expect(panel).toHaveStyle({ position: "fixed", top: `${anchorBottom + 8}px` });
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(panel).toHaveFocus();

      await user.tab();
      expect(within(panel).getByRole("button", { name: "Cerrar panel del encabezado" })).toHaveFocus();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("dialog", { name: "Panel del encabezado" })).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
    },
  );

  it("receives avatar changes through props without requesting or querying the personal profile", async () => {
    const user = userEvent.setup();
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const request = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected avatar request"));
    const shell = (avatarId: "leaf" | "sun" | null) => (
      <QueryClientProvider client={client}>
        <AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" userAvatarId={avatarId}><div /></AppShell>
      </QueryClientProvider>
    );
    const view = rtlRender(shell("leaf"));

    await user.click(screen.getAllByRole("button", { name: "Abrir perfil" })[0]);
    view.rerender(shell("sun"));
    expect(document.querySelectorAll('[data-profile-avatar="sun"]')).toHaveLength(3);
    view.rerender(shell(null));
    expect(document.querySelector("[data-profile-avatar]")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Panel del encabezado" }).querySelector(".top-header-popover__avatar")).toHaveTextContent(/^J$/);
    expect(client.getQueryCache().findAll({ queryKey: ["user-profile"] })).toHaveLength(0);
    expect(request).not.toHaveBeenCalled();

    view.unmount();
    client.clear();
  });

  it("marks the current section", () => {
    render(
      <AppShell
        activeSection="bookings"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    const currentItems = screen.getAllByRole("button", {
      name: "Reservas",
      current: "page",
    });

    expect(currentItems.length).toBeGreaterThan(0);
  });

  it.each([
    ["home", "Inicio"],
    ["calendar", "Calendario"],
    ["bookings", "Reservas"],
  ] as const)("keeps %s current in the mobile bottom navigation", (activeSection, label) => {
    render(
      <AppShell
        activeSection={activeSection}
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    const bottomNavigation = document.querySelector(".top-bottom-nav") as HTMLElement;

    expect(
      within(bottomNavigation).getByRole("button", {
        name: label,
        current: "page",
      }),
    ).toBeInTheDocument();
  });

  it.each([
    "availability",
    "resources",
    "contacts",
    "pricing",
    "payments",
    "blocks",
    "settings",
  ] as const)("keeps Más current for the %s section", (activeSection) => {
    render(
      <AppShell
        activeSection={activeSection}
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    const bottomNavigation = document.querySelector(".top-bottom-nav") as HTMLElement;

    expect(
      within(bottomNavigation).getByRole("button", {
        name: "Más",
        current: "page",
      }),
    ).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps mobile navigation and Más expansion behavior", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
        onNavigate={onNavigate}
      >
        <div />
      </AppShell>,
    );

    const bottomNavigation = document.querySelector(".top-bottom-nav") as HTMLElement;
    const calendar = within(bottomNavigation).getByRole("button", { name: "Calendario" });
    const more = within(bottomNavigation).getByRole("button", { name: "Más" });

    await user.click(calendar);
    expect(onNavigate).toHaveBeenCalledWith("calendar");

    expect(more).toHaveAttribute("aria-expanded", "false");
    await user.click(more);
    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Más opciones" })).toBeInTheDocument();
  });

  it("reports navigation intent without owning routing", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
        onNavigate={onNavigate}
      >
        <div />
      </AppShell>,
    );

    await user.click(
      screen.getAllByRole("button", { name: "Calendario" })[0],
    );

    expect(onNavigate).toHaveBeenCalledWith("calendar");
  });

  it("opens and closes the mobile Más menu", async () => {
    const user = userEvent.setup();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    const moreButton = screen.getByRole("button", { name: "Más" });

    expect(
      screen.queryByRole("dialog", { name: "Más opciones" }),
    ).not.toBeInTheDocument();

    await user.click(moreButton);

    expect(
      screen.getByRole("dialog", { name: "Más opciones" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cerrar menú Más" }),
    );

    await waitForElementToBeRemoved(() => screen.queryByRole("dialog", { name: "Más opciones" }));
  });

  it("navigates from Más and closes the menu", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
        onNavigate={onNavigate}
      >
        <div />
      </AppShell>,
    );

    await user.click(
      screen.getByRole("button", { name: "Más" }),
    );

    const moreMenu = screen.getByRole("dialog", { name: "Más opciones" });

    await user.click(
      within(moreMenu).getByRole("button", { name: "Precios" }),
    );

    expect(onNavigate).toHaveBeenCalledWith("pricing");

    await waitForElementToBeRemoved(() => screen.queryByRole("dialog", { name: "Más opciones" }));
  });
  it("searches modules and reports navigation intent", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
        onNavigate={onNavigate}
      >
        <div />
      </AppShell>,
    );

    const searchboxes = screen.getAllByRole("combobox", {
      name: "Buscar en TOP",
    });

    await user.type(searchboxes[0], "Recursos");

    const panel = screen.getByRole("region", {
      name: "Panel del encabezado",
    });

    await user.click(
      within(panel).getByRole("option", {
        name: "Recursos",
      }),
    );

    expect(onNavigate).toHaveBeenCalledWith("resources");
  });

  it("opens the active business panel", async () => {
    const user = userEvent.setup();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    await user.click(
      screen.getAllByRole("button", {
        name: "Cambiar negocio activo",
      })[0],
    );

    const panel = screen.getByRole("dialog", {
      name: "Panel del encabezado",
    });

    expect(
      within(panel).getByText("Negocio seleccionado actualmente"),
    ).toBeInTheDocument();

    expect(
      within(panel).getByText("Tobera"),
    ).toBeInTheDocument();
  });

  it("opens notifications without claiming that operational alerts are implemented", async () => {
    const user = userEvent.setup();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
      >
        <div />
      </AppShell>,
    );

    await user.click(
      screen.getAllByRole("button", {
        name: "Notificaciones",
      })[0],
    );

    const panel = screen.getByRole("dialog", {
      name: "Panel del encabezado",
    });

    expect(
      within(panel).getByText("Notificaciones aún no disponibles"),
    ).toBeInTheDocument();

    expect(
      within(panel).getByText("Por ahora, revisa la actividad en Calendario, Reservas y Pagos."),
    ).toBeInTheDocument();
  });

  it("opens profile and navigates to settings", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();

    render(
      <AppShell
        activeSection="home"
        businessName="Tobera"
        userName="Jeni"
        userRole="Propietaria"
        onNavigate={onNavigate}
      >
        <div />
      </AppShell>,
    );

    await user.click(
      screen.getAllByRole("button", {
        name: "Abrir perfil",
      })[0],
    );

    const panel = screen.getByRole("dialog", {
      name: "Panel del encabezado",
    });

    expect(
      within(panel).getByText("Propietaria"),
    ).toBeInTheDocument();

    await user.click(
      within(panel).getByRole("button", {
        name: "Configuración",
      }),
    );

    expect(onNavigate).toHaveBeenCalledWith("settings");
  });

  it("runs logout from the accessible profile action", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();

    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" onLogout={onLogout}><div /></AppShell>);
    await user.click(screen.getAllByRole("button", { name: "Abrir perfil" })[0]);
    await user.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("restores the Más trigger after Escape from a focused menu control", async () => {
    const user = userEvent.setup();
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria"><div /></AppShell>);
    const more = screen.getByRole("button", { name: "Más" });
    await user.click(more);
    expect(screen.getByRole("dialog", { name: "Más opciones" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cerrar menú Más" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
    expect(more).toHaveFocus();
  });

  it("closes profile on navigation and returns focus on explicit dismissal", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" onNavigate={onNavigate}><div /></AppShell>);
    const trigger = screen.getAllByRole("button", { name: "Abrir perfil" })[0];
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Configuración" }));
    expect(onNavigate).toHaveBeenCalledWith("settings");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the mobile overlay when the desktop breakpoint hides its trigger", async () => {
    const listeners = new Set<() => void>();
    const media = { matches: false, addEventListener: (_event: string, listener: () => void) => listeners.add(listener), removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener) };
    vi.stubGlobal("matchMedia", () => media);
    try {
      const user = userEvent.setup();
      render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria"><h1>Contenido</h1></AppShell>);
      await user.click(screen.getByRole("button", { name: "Más" }));
      expect(screen.getByRole("dialog")).toHaveFocus();
      act(() => { media.matches = true; listeners.forEach((listener) => listener()); });
      await waitForElementToBeRemoved(() => screen.queryByRole("dialog"));
      expect(screen.getByRole("main")).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("disables logout while it is running", async () => {
    const user = userEvent.setup();
    render(<AppShell activeSection="home" businessName="Tobera" userName="Jeni" userRole="Propietaria" isLoggingOut><div /></AppShell>);
    await user.click(screen.getAllByRole("button", { name: "Abrir perfil" })[0]);
    expect(screen.getByRole("button", { name: "Cerrando sesión..." })).toBeDisabled();
  });
});

function render(ui: ReactElement) { return rtlRender(<QueryProvider>{ui}</QueryProvider>); }
