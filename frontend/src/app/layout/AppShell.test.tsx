import { render, screen, within } from "@testing-library/react";
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
      screen.queryByRole("region", { name: "Más opciones" }),
    ).not.toBeInTheDocument();

    await user.click(moreButton);

    expect(
      screen.getByRole("region", { name: "Más opciones" }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Cerrar menú Más" }),
    );

    expect(
      screen.queryByRole("region", { name: "Más opciones" }),
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

    const moreMenu = screen.getByRole("region", { name: "Más opciones" });

    await user.click(
      within(moreMenu).getByRole("button", { name: "Precios" }),
    );

    expect(onNavigate).toHaveBeenCalledWith("pricing");

    expect(
      screen.queryByRole("region", { name: "Más opciones" }),
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

    const searchboxes = screen.getAllByRole("searchbox", {
      name: "Buscar en TOP",
    });

    await user.type(searchboxes[0], "Recursos");

    const panel = screen.getByRole("region", {
      name: "Panel del encabezado",
    });

    await user.click(
      within(panel).getByRole("button", {
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

    const panel = screen.getByRole("region", {
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

    const panel = screen.getByRole("region", {
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

    const panel = screen.getByRole("region", {
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
});
