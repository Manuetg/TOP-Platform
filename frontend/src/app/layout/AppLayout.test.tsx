import { QueryProvider } from "../providers/QueryProvider";
import type { ReactElement } from "react";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import * as authContext from "../../features/auth/context/AuthContext";
import * as businessContext from "../../features/business/context/BusinessContext";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import { AppLayout } from "./AppLayout";

afterEach(() => vi.restoreAllMocks());
beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 100, y: 20, top: 20, left: 100, right: 300, bottom: 64, width: 200, height: 44, toJSON: () => ({}) });
});

function signedIn(displayName: string | null) {
  vi.spyOn(authContext, "useAuth").mockReturnValue({
    status: "authenticated", isAuthenticated: true, isLoggingOut: false,
    establishSession: vi.fn(), updateUserProfile: vi.fn(), logout: async () => undefined,
    session: {
      accessToken: "test-access", refreshToken: "test-refresh", tokenType: "Bearer", expiresIn: 900,
      user: { id: "user-1", email: "jeni@example.test", displayName, status: "ACTIVE" },
      memberships: [],
    },
  });
}

function renderApp(initialEntry = "/app", settingsElement = <h1>Configuración</h1>) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/app" element={<AppLayout />}>
          <Route index element={<h1>Inicio</h1>} />
          <Route path="calendar" element={<h1>Calendario</h1>} />
          <Route path="bookings" element={<h1>Reservas</h1>} />
          <Route path="availability" element={<h1>Disponibilidad</h1>} />
          <Route path="resources" element={<h1>Recursos</h1>} />
          <Route path="contacts" element={<h1>Contactos</h1>} />
          <Route path="pricing" element={<h1>Precios</h1>} />
          <Route path="payments" element={<h1>Pagos</h1>} />
          <Route path="blocks" element={<h1>Bloqueos</h1>} />
          <Route path="settings" element={settingsElement} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout", () => {
  it.each(["/app/settings", "/app/settings/"])("preserves the personal draft when selecting another business at %s", async (path) => {
    signedIn("Jeni González");
    const businesses = ["a", "b"].map((id) => ({
      id, name: `Negocio ${id}`, legalName: null, taxId: null, currency: "PYG",
      timezone: "America/Asuncion", status: "ACTIVE" as const,
      createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z",
    }));
    const selectBusiness = vi.fn(() => true);
    vi.spyOn(businessContext, "useBusinessContext").mockReturnValue({
      businesses, activeBusiness: businesses[0], activeBusinessId: "a", activeMembership: null,
      activeRole: "OWNER", status: "ready", error: null, retry: vi.fn(), selectBusiness,
    });
    const user = userEvent.setup();
    renderApp(path, <><h1>Configuración</h1><label>Nombre borrador<input defaultValue="Jeni" /></label><label>Motivo borrador<input /></label></>);
    await user.type(screen.getByRole("textbox", { name: "Nombre borrador" }), " actualizado");
    await user.type(screen.getByRole("textbox", { name: "Motivo borrador" }), "Preferencia personal");
    await user.click(screen.getAllByRole("button", { name: "Cambiar negocio activo" })[0]);
    await user.click(screen.getByRole("button", { name: /Negocio b/ }));
    expect(selectBusiness).toHaveBeenCalledWith("b");
    expect(screen.getByRole("heading", { name: "Configuración" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Nombre borrador" })).toHaveValue("Jeni actualizado");
    expect(screen.getByRole("textbox", { name: "Motivo borrador" })).toHaveValue("Preferencia personal");
    expect(screen.queryByRole("heading", { name: "Inicio" })).not.toBeInTheDocument();
  });

  it("shows the personal name in navigation and retains the account email", async () => {
    signedIn("Jeni González");
    renderApp();
    expect(screen.getAllByText("Jeni González").length).toBeGreaterThan(0);
    await userEvent.click(screen.getAllByRole("button", { name: "Abrir perfil" })[0]);
    expect(screen.getByText("jeni@example.test")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cookies y almacenamiento" })).toHaveAttribute("href", "/cookies");
  });

  it("uses the email for legacy accounts without a personal name", () => {
    signedIn(null);
    renderApp();
    expect(screen.getAllByText("jeni@example.test").length).toBeGreaterThan(0);
  });

  it.each(["/app/settings", "/app/settings/"])("keeps account settings accessible at %s without an active business", (path) => {
    signedIn("Jeni González");
    vi.spyOn(businessContext, "useBusinessContext").mockReturnValue({
      businesses: [], activeBusiness: null, activeBusinessId: "", activeMembership: null,
      activeRole: null, status: "empty", error: null, retry: vi.fn(), selectBusiness: () => false,
    });
      renderApp(path);
      expect(screen.getByRole("heading", { name: "Configuración" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: "Configuración", current: "page" }).length).toBeGreaterThan(0);
    expect(screen.queryByText("No tenés un negocio activo disponible.")).not.toBeInTheDocument();
  });

  it("renders the section associated with a deep link", () => {
    renderApp("/app/pricing");

    expect(
      screen.getByRole("heading", { name: "Precios" }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Precios",
        current: "page",
      }),
    ).toBeInTheDocument();
  });

  it("navigates between sections through the AppShell", async () => {
    const user = userEvent.setup();

    renderApp("/app");

    expect(
      screen.getByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();

    document.documentElement.scrollTop = 400;

    await user.click(
      screen.getAllByRole("button", { name: "Reservas" })[0],
    );

    expect(
      screen.getByRole("heading", { name: "Reservas" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveFocus();
    expect(document.documentElement.scrollTop).toBe(0);
  });

  it("opens Más without changing the current route", async () => {
    const user = userEvent.setup();

    renderApp("/app");

    await user.click(
      screen.getByRole("button", { name: "Más" }),
    );

    expect(
      screen.getByRole("heading", { name: "Inicio" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Más opciones" })).toHaveFocus();
  });
});

function render(ui: ReactElement) { return rtlRender(<QueryProvider>{ui}</QueryProvider>); }
