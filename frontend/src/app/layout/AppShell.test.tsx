import { QueryProvider } from "../providers/QueryProvider";
import type { ReactElement } from "react";
import { act, render as rtlRender, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
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

    expect(
      screen.queryByRole("dialog", { name: "Más opciones" }),
    ).not.toBeInTheDocument();
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

    expect(
      screen.queryByRole("dialog", { name: "Más opciones" }),
    ).not.toBeInTheDocument();
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

  it("opens notifications with a valid empty state", async () => {
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
      within(panel).getByText("Todo al día"),
    ).toBeInTheDocument();

    expect(
      within(panel).getByText("No tenés notificaciones nuevas."),
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
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
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
