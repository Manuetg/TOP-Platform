import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBusinessContext } from "../../features/business/context/BusinessContext";
import { appRoutes } from "./appRoutes";

const context = vi.hoisted(() => ({
  authStatus: "authenticated", businessStatus: "ready", businessId: "business-2", role: "OWNER",
  calendarRenders: 0,
}));
vi.mock("../../features/auth/context/AuthContext", () => ({
  useAuth: () => ({ status: context.authStatus, session: context.authStatus === "authenticated" ? {
    accessToken: "test-token", user: { id: "user-1", email: "test@example.invalid" },
  } : null, logout: vi.fn(), isLoggingOut: false }),
}));
vi.mock("../../features/business/context/BusinessContext", () => ({
  useBusinessContext: () => ({
    status: context.businessStatus, businesses: [], activeBusinessId: context.businessId,
    activeBusiness: { id: context.businessId, name: "Negocio de prueba B" }, activeRole: context.role,
  }),
}));
// Sustituye hojas de páginas; conserva la ruta productiva, ProtectedRoute, layout y BusinessBoundary.
vi.mock("../../features/availability/pages/AvailabilityCalendarPage", () => ({
  AvailabilityCalendarPage: () => {
    context.calendarRenders += 1;
    const business = useBusinessContext();
    return <><h1>Calendario de prueba</h1><output aria-label="Negocio del calendario">{business.activeBusinessId}</output><output aria-label="Rol del calendario">{business.activeRole}</output></>;
  },
}));
vi.mock("../../features/resources/pages/ResourceListPage", () => ({ ResourceListPage: () => <h1>Recursos de prueba</h1> }));
vi.mock("../../features/bookings/pages/BookingDetailPage", () => ({ BookingDetailPage: () => <h1>Detalle de reserva de prueba</h1> }));
vi.mock("../../features/bookings/pages/EditBookingPage", () => ({ EditBookingPage: () => <h1>Edición de reserva de prueba</h1> }));
vi.mock("../../features/auth/pages/LoginPage", () => ({ LoginPage: () => <h1>Login de prueba</h1> }));

const clients: QueryClient[] = [];
function mount(initialEntries: string[], initialIndex = initialEntries.length - 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(client);
  const router = createMemoryRouter(appRoutes, { initialEntries, initialIndex });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return router;
}
beforeEach(() => Object.assign(context, {
  authStatus: "authenticated", businessStatus: "ready", businessId: "business-2", role: "OWNER", calendarRenders: 0,
}));
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); });

describe("compatibilidad de la creación de reservas centralizada en Calendario", () => {
  it.each(["/app/bookings/new", "/app/bookings/new/", "/app/bookings/new?resourceId=legacy-resource#legacy"])("redirige el acceso directo %s sin inventar parámetros ni cambiar el negocio", async (entry) => {
    const router = mount([entry]);
    expect(await screen.findByRole("heading", { name: "Calendario de prueba" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/calendar");
    expect(router.state.location.search).toBe("");
    expect(router.state.location.hash).toBe("");
    expect(router.state.historyAction).toBe("REPLACE");
    expect(screen.getByLabelText("Negocio del calendario")).toHaveTextContent("business-2");
  });

  it("Back vuelve a la entrada anterior y Forward conserva Calendario sin bucle por la ruta antigua", async () => {
    const router = mount(["/app/resources", "/app/bookings/new"]);
    await screen.findByRole("heading", { name: "Calendario de prueba" });
    await act(async () => { await router.navigate(-1); });
    expect(await screen.findByRole("heading", { name: "Recursos de prueba" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/resources");
    await act(async () => { await router.navigate(1); });
    expect(await screen.findByRole("heading", { name: "Calendario de prueba" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/calendar");
    expect(router.state.historyAction).toBe("POP");
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"])("la ruta compatible lleva %s a Calendario con su rol vigente", async (role) => {
    context.role = role;
    mount(["/app/bookings/new"]);
    await screen.findByRole("heading", { name: "Calendario de prueba" });
    expect(screen.getByLabelText("Rol del calendario")).toHaveTextContent(role);
  });

  it("protege la URL antigua sin sesión y conserva destino de retorno a login", async () => {
    context.authStatus = "unauthenticated";
    const router = mount(["/app/bookings/new"]);
    await screen.findByRole("heading", { name: "Login de prueba" });
    expect(router.state.location.pathname).toBe("/login");
    expect(new URLSearchParams(router.state.location.search).get("next")).toBe("/app/bookings/new");
    expect(context.calendarRenders).toBe(0);
  });

  it("espera la restauración de sesión antes de redirigir a una pantalla privada", () => {
    context.authStatus = "restoring";
    const router = mount(["/app/bookings/new"]);
    expect(screen.getByText("Cargando sesión...")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/app/bookings/new");
    expect(context.calendarRenders).toBe(0);
  });

  it.each(["empty", "selection-required"])("mantiene el límite de negocio %s sin montar Calendario", async (status) => {
    context.businessStatus = status;
    const router = mount(["/app/bookings/new"]);
    await waitFor(() => expect(screen.getByText(status === "empty" ? "No tenés un negocio activo disponible." : "Seleccioná un negocio para continuar.")).toBeInTheDocument());
    expect(router.state.location.pathname).toBe("/app/bookings/new");
    expect(context.calendarRenders).toBe(0);
  });

  it.each([
    ["/app/bookings/booking-1", "Detalle de reserva de prueba"],
    ["/app/bookings/booking-1/edit", "Edición de reserva de prueba"],
  ])("conserva la ruta de detalle o edición %s", async (entry, heading) => {
    const router = mount([entry]);
    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(entry);
    expect(context.calendarRenders).toBe(0);
  });
});
