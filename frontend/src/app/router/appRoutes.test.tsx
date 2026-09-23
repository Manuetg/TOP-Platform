import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, type RouteObject } from "react-router-dom";
import { QueryClient, QueryClientProvider, useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appRoutes } from "./appRoutes";
import { ErrorFallback } from "../errors/ErrorFallback";

const state = vi.hoisted(() => ({
  status: "authenticated", businessStatus: "ready", userId: "user-1", businessId: "business-1",
  pageFails: true, shellFails: false, pageRenders: 0, logout: vi.fn(), mutation: vi.fn(),
}));
vi.mock("../../features/auth/context/AuthContext", () => ({
  useAuth: () => ({ status: state.status, session: { user: { id: state.userId, email: "demo@example.test" } }, logout: state.logout }),
}));
vi.mock("../../features/business/context/BusinessContext", () => ({
  useBusinessContext: () => {

    return { status: state.businessStatus, businesses: [], activeBusinessId: state.businessId, activeBusiness: { id: state.businessId, name: "Negocio de prueba" }, activeRole: "OWNER" };
  },
}));
vi.mock("../layout/AppShell", async (importOriginal) => {
  const original = await importOriginal<typeof import("../layout/AppShell")>();
  return { ...original, AppShell: (props: React.ComponentProps<typeof original.AppShell>) => {
    if (state.shellFails) throw new Error("SYNTHETIC_SHELL_SECRET");
    return <original.AppShell {...props} />;
  } };
});
vi.mock("../../features/dashboard/pages/DashboardPage", () => ({ DashboardPage: () => <h1>Inicio sano</h1> }));
vi.mock("../../features/auth/pages/LoginPage", () => ({ LoginPage: () => <h1>Login</h1> }));
vi.mock("../../features/payments/pages/PaymentHubPage", () => ({
  PaymentHubPage: () => <h1>Pagos</h1>,
}));
vi.mock("../../features/resources/pages/ResourceListPage", () => ({
  ResourceListPage: () => {
    state.pageRenders++;
    if (state.pageFails) throw new Error("SYNTHETIC_RENDER_SECRET stack token request");
    return <h1>Recursos recuperados</h1>;
  },
}));

function mount(entry = "/app/resources", routes = appRoutes) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(routes, { initialEntries: [entry] });
  render(<QueryClientProvider client={client}><RouterProvider router={router} /></QueryClientProvider>);
  return { router, client };
}
async function navigate(router: ReturnType<typeof createMemoryRouter>, path = "/app/resources") {
  await act(async () => { await router.navigate(path); });
}

describe("recuperación en las rutas productivas", () => {
  beforeEach(() => {
    Object.assign(state, { status: "authenticated", businessStatus: "ready", userId: "user-1", businessId: "business-1", pageFails: true, shellFails: false, pageRenders: 0 });
    state.mutation.mockReset();
    // React informa las excepciones sintéticas de estos casos. Solo se silencia este describe.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it("aísla la página, conserva shell/cuenta/cache y no expone detalles", async () => {
    const { client } = mount();
    client.setQueryData(["sentinel"], "conservado");
    const title = screen.getByRole("heading", { name: "No pudimos mostrar esta pantalla." });
    expect(title).toHaveFocus();
    expect(screen.getByRole("alert")).toContainElement(title);
    expect(screen.getAllByText("Negocio de prueba").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Reservas" }).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/SYNTHETIC|Unexpected Application Error|stack token/);
    expect(client.getQueryData(["sentinel"])).toBe("conservado");
    await userEvent.click(screen.getAllByRole("button", { name: "Abrir perfil" })[0]);
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toBeEnabled();
  });

  it("reintenta una falla transitoria por teclado", async () => {
    mount();
    state.pageFails = false;
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "Reintentar" })).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("heading", { name: "Recursos recuperados" })).toBeInTheDocument();
  });

  it("mantiene una salida ante falla persistente sin remontajes automáticos", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    const renders = state.pageRenders;
    await act(async () => { await Promise.resolve(); });
    expect(state.pageRenders).toBe(renders);
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/app");
    await userEvent.click(screen.getByRole("link", { name: "Ir al inicio" }));
    expect(screen.getByRole("heading", { name: "Inicio sano" })).toBeInTheDocument();
  });

  it("permite continuar mediante navegación del shell", async () => {
    mount();
    await userEvent.click(screen.getByRole("button", { name: "Pagos" }));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pagos" })).toBeInTheDocument();
  });

  it.each(["unauthenticated", "restoring"])("no muestra página ni fallback privado durante %s", async (status) => {
    state.status = status;
    const { router } = mount();
    if (status === "unauthenticated") await waitFor(() => expect(router.state.location.pathname).toBe("/login"));
    else expect(screen.getByText("Cargando sesión...")).toBeInTheDocument();
    expect(state.pageRenders).toBe(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("retira un fallback privado al perder sesión", async () => {
    const { router } = mount();
    state.status = "unauthenticated";
    await navigate(router);
    expect(await screen.findByRole("heading", { name: "Login" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each(["empty", "selection-required"])("preserva el estado normal Business %s", (status) => {
    state.businessStatus = status;
    mount();
    expect(screen.getByText(status === "empty" ? "No tenés un negocio activo disponible." : "Seleccioná un negocio para continuar.")).toBeInTheDocument();
    expect(state.pageRenders).toBe(0);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("usa el respaldo general si falla el layout sin volver a consumir Business", () => {
    state.shellFails = true;
    mount();
    expect(screen.getByRole("heading", { name: "La aplicación encontró un problema." })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Recargar aplicación" })).toBeInTheDocument();
    expect(screen.queryByText(/SYNTHETIC/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reservas" })).not.toBeInTheDocument();
  });

  it("cancela una request en vuelo sin convertirla en fallo del shell", async () => {
    let aborted = false;
    function PendingQueryPage() {
      useQuery({ queryKey: ["pending"], queryFn: ({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); });
      }) });
      return <p>Consulta pendiente</p>;
    }
    const { client } = mount("/app/resources", structuredCloneRoutes(<PendingQueryPage />));
    await act(async () => { await client.cancelQueries({ queryKey: ["pending"] }); });
    expect(aborted).toBe(true);
    expect(client.getQueryState(["pending"])?.fetchStatus).toBe("idle");
    expect(screen.getByText("Consulta pendiente")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("cubre errores propagados por el router con un respaldo neutral", async () => {
    const routes = structuredCloneRoutes(<p>No debe aparecer</p>);
    const resource = routes[0].children?.find((route) => route.path === "/app")?.children?.find((route) => route.path === "resources");
    if (!resource) throw new Error("Falta la ruta productiva de recursos");
    resource.loader = () => { throw new Error("SYNTHETIC_LOADER_SECRET"); };
    // This synthetic async loader needs an initial fallback; production routes have none.
    routes[0].hydrateFallbackElement = <p>Cargando prueba de ruta...</p>;
    mount("/app/resources", routes);
    expect(await screen.findByRole("heading", { name: "La aplicación encontró un problema." })).toBeInTheDocument();
    expect(screen.queryByText("No debe aparecer")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("SYNTHETIC_LOADER_SECRET");
  });
  it("mantiene el 404 existente", () => {
    mount("/ruta-inexistente");
    expect(screen.getByRole("heading", { name: "Página no encontrada" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver al inicio de sesión" })).toHaveAttribute("href", "/login");
  });

  it("no vuelve a ejecutar una mutation previa al reintentar", async () => {
    function MutationPage() {
      const [fail, setFail] = useState(false);
      const mutation = useMutation({ mutationFn: async () => { state.mutation(); } });
      if (fail) throw new Error("SYNTHETIC_AFTER_MUTATION");
      return <button onClick={() => mutation.mutate(undefined, { onSuccess: () => setFail(true) })}>Guardar prueba</button>;
    }
    const routes = structuredCloneRoutes(<MutationPage />);
    mount("/app/resources", routes);
    await userEvent.click(screen.getByRole("button", { name: "Guardar prueba" }));
    await screen.findByRole("button", { name: "Reintentar" });
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(screen.getByRole("button", { name: "Guardar prueba" })).toBeInTheDocument();
    expect(state.mutation).toHaveBeenCalledTimes(1);
  });

  it("conserva mensaje y retry de una query local", async () => {
    function QueryPage() {
      const query = useQuery({ queryKey: ["operational"], queryFn: async () => { throw new Error("HTTP 503"); } });
      return query.isError ? <><p>Error local manejado</p><button onClick={() => { void query.refetch(); }}>Reintentar consulta</button></> : <p>Cargando consulta</p>;
    }
    mount("/app/resources", structuredCloneRoutes(<QueryPage />));
    expect(await screen.findByText("Error local manejado")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar consulta" }));
    await screen.findByText("Error local manejado");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getAllByText("Error local manejado")).toHaveLength(1);
  });
});

// Sustituye solamente la hoja; conserva los guards, layout y boundaries productivos.
function structuredCloneRoutes(element: React.ReactNode): RouteObject[] {
  function copy(route: RouteObject): RouteObject {
    if (route.index) return { ...route };
    return {
      ...route,
      element: route.path === "resources" ? element : route.element,
      children: route.children?.map(copy),
    };
  }
  return appRoutes.map(copy);
}
it("el respaldo general funciona sin router ni providers y recarga explícitamente", async () => {
  const reload = vi.fn();
  vi.stubGlobal("location", { reload });
  try {
    render(<ErrorFallback general />);
    expect(screen.getByRole("link", { name: "Ir al inicio" })).toHaveAttribute("href", "/app");
    await userEvent.click(screen.getByRole("button", { name: "Recargar aplicación" }));
    expect(reload).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
