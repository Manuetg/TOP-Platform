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
});
