import { QueryProvider, queryClient } from "../providers/QueryProvider";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { act, cleanup, render as rtlRender, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, vi } from "vitest";
import * as authContext from "../../features/auth/context/AuthContext";
import * as businessContext from "../../features/business/context/BusinessContext";
import * as profileApi from "../../features/profile/api/user-profile";
import { PersonalProfile } from "../../features/profile/components/PersonalProfile";
import { userProfileKey } from "../../features/profile/queries/use-user-profile";
import type { LoginResponse } from "../../features/auth/types/auth.types";
import { requestUrl } from "../../../tests/request-url";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import { AppLayout } from "./AppLayout";

const avatarClients: QueryClient[] = [];
const profileValue = (id: string, avatarId: profileApi.ProfileAvatarId | null = null): profileApi.UserProfile => ({
  id, email: `${id}@example.test`, displayName: id === "one" ? "Ana" : "Beatriz", birthYear: null,
  username: null, phone: null, avatarId, status: "ACTIVE", updatedAt: "2026-10-02T00:00:00.000Z",
});
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

afterEach(() => {
  cleanup(); queryClient.clear(); avatarClients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});
beforeEach(() => {
  queryClient.clear();
  vi.spyOn(profileApi, "getUserProfile").mockImplementation(async (id) => profileValue(id));
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

const avatarSession = (id: string): LoginResponse => ({
  accessToken: `token-${id}`, refreshToken: `refresh-${id}`, tokenType: "Bearer", expiresIn: 900,
  user: { id, email: `${id}@example.test`, displayName: id === "one" ? "Ana" : "Beatriz", status: "ACTIVE" },
  memberships: [{ businessId: "business-a", role: "OWNER" }],
});

function AvatarAuthControls() {
  const auth = authContext.useAuth();
  return <>
    <button onClick={() => auth.establishSession(avatarSession("one"))}>Entrar A</button>
    <button onClick={() => auth.establishSession(avatarSession("two"))}>Entrar B</button>
    <button onClick={() => { void auth.logout(); }}>Salir de prueba</button>
    <output aria-label="Estado de sesión">{auth.status}</output>
    <output aria-label="Token de sesión">{auth.session?.accessToken}</output>
    <output aria-label="Membresías de sesión">{JSON.stringify(auth.session?.memberships)}</output>
  </>;
}

function ConnectedPersonalProfile() {
  const { updateUserProfile } = authContext.useAuth();
  return <PersonalProfile onSaved={updateUserProfile} />;
}

function mountAvatar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000, gcTime: Infinity } } });
  avatarClients.push(client);
  const view = rtlRender(<QueryClientProvider client={client}><authContext.AuthProvider><AvatarAuthControls />
    <MemoryRouter initialEntries={["/app/settings"]}><Routes>
      <Route path="/app" element={<AppLayout />}><Route path="settings" element={<ConnectedPersonalProfile />} /></Route>
    </Routes></MemoryRouter>
  </authContext.AuthProvider></QueryClientProvider>);
  return { ...view, client };
}

describe("avatar del header con perfil SELF y sesión reales", () => {
  let profiles: Map<string, profileApi.UserProfile>;
  let requests: { path: string; init: RequestInit }[];
  let override: (path: string, init: RequestInit) => Response | Promise<Response> | undefined;

  beforeEach(() => {
    vi.mocked(profileApi.getUserProfile).mockRestore();
    sessionStorage.clear(); localStorage.clear();
    profiles = new Map([["one", profileValue("one", "leaf")], ["two", profileValue("two", "sun")]]);
    requests = []; override = () => undefined;
    vi.spyOn(businessContext, "useBusinessContext").mockReturnValue({
      businesses: [], activeBusiness: null, activeBusinessId: "", activeMembership: null,
      activeRole: null, status: "empty", error: null, retry: vi.fn(), selectBusiness: () => false,
    });
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname;
      requests.push({ path, init });
      const custom = override(path, init); if (custom) return custom;
      if (path === "/api/auth/logout") return new Response(null, { status: 204 });
      const match = /^\/api\/users\/([^/]+)\/profile$/.exec(path);
      if (!match || !profiles.has(match[1])) throw new Error(`Solicitud inesperada: ${path}`);
      const id = match[1];
      if (init.method === "PATCH") {
        const { expectedUpdatedAt, ...body } = JSON.parse(String(init.body));
        const current = profiles.get(id)!;
        if (expectedUpdatedAt !== current.updatedAt) return json({ message: "El perfil cambió." }, 409);
        profiles.set(id, { ...current, ...body, updatedAt: new Date(Date.parse(current.updatedAt) + 1).toISOString() });
      }
      return json(profiles.get(id));
    }));
  });
  afterEach(() => { sessionStorage.clear(); localStorage.clear(); });

  it("comparte un GET SELF pendiente entre header y Settings sin depender del Business", async () => {
    const reading = deferred<Response>();
    override = (path) => path === "/api/users/one/profile" ? reading.promise : undefined;
    mountAvatar();
    expect(requests).toHaveLength(0);
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    expect(requests).toHaveLength(1);
    expect(requests[0].path).toBe("/api/users/one/profile");
    expect(new Headers(requests[0].init.headers).get("Authorization")).toBe("Bearer token-one");
    expect(document.querySelectorAll("[data-profile-avatar]")).toHaveLength(0);
    await act(async () => { reading.resolve(json(profiles.get("one"))); });
    await screen.findByDisplayValue("Ana");
    await waitFor(() => expect(document.querySelectorAll('[data-profile-avatar="leaf"]')).toHaveLength(2));
    expect(requests).toHaveLength(1);
  });

  it("guardar y limpiar el avatar actualiza ambos triggers sin alterar tokens ni membresías", async () => {
    mountAvatar();
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    await screen.findByDisplayValue("Ana");
    const form = screen.getByRole("form", { name: "Datos de tu cuenta" });
    await userEvent.click(within(form).getByRole("radio", { name: "Sol" }));
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    await waitFor(() => expect(document.querySelectorAll('[data-profile-avatar="sun"]')).toHaveLength(2));
    expect(document.querySelectorAll('[data-profile-avatar="leaf"]')).toHaveLength(0);
    await userEvent.click(within(form).getByRole("radio", { name: "Sin avatar" }));
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    await waitFor(() => expect(document.querySelectorAll("[data-profile-avatar]")).toHaveLength(0));
    expect(document.querySelector(".top-global-header__avatar")).toHaveTextContent("A");
    const patches = requests.filter((item) => item.init.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(JSON.parse(String(patches[0].init.body)).avatarId).toBe("sun");
    expect(JSON.parse(String(patches[1].init.body)).avatarId).toBeNull();
    expect(requests.filter((item) => !item.init.method || item.init.method === "GET")).toHaveLength(1);
    expect(screen.getByLabelText("Token de sesión")).toHaveTextContent("token-one");
    expect(screen.getByLabelText("Membresías de sesión")).toHaveTextContent(JSON.stringify(avatarSession("one").memberships));
    expect(profiles.get("one")?.email).toBe("one@example.test");
  });

  it.each([403, 404, 500])("un GET %s retira el avatar cacheado sin inventar logout", async (status) => {
    const { client } = mountAvatar();
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    await screen.findByDisplayValue("Ana");
    expect(document.querySelectorAll('[data-profile-avatar="leaf"]')).toHaveLength(2);
    override = () => json({ message: "Perfil no disponible." }, status);
    await act(async () => { await client.refetchQueries({ queryKey: userProfileKey("one"), exact: true }); });
    await waitFor(() => expect(document.querySelectorAll("[data-profile-avatar]")).toHaveLength(0));
    expect(document.querySelector(".top-global-header__avatar")).toHaveTextContent("A");
    expect(screen.getByLabelText("Estado de sesión")).toHaveTextContent("authenticated");
    expect(requests).toHaveLength(2);
  });

  it.each(["otra identidad", "usuario deshabilitado"])("descarta el avatar de %s", async (caseName) => {
    override = () => json(caseName === "otra identidad" ? profileValue("two", "sun") : { ...profileValue("one", "leaf"), status: "DISABLED" });
    const { client } = mountAvatar();
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    await waitFor(() => expect(client.getQueryState(userProfileKey("one"))?.fetchStatus).toBe("idle"));
    expect(document.querySelectorAll("[data-profile-avatar]")).toHaveLength(0);
    expect(screen.getByLabelText("Estado de sesión")).toHaveTextContent("authenticated");
    expect(requests).toHaveLength(1);
  });

  it("cambiar identidad aborta GET A y su respuesta tardía no reemplaza el avatar B", async () => {
    const reading = deferred<Response>();
    override = (path) => path === "/api/users/one/profile" ? reading.promise : undefined;
    const { client } = mountAvatar();
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    const old = requests[0];
    await userEvent.click(screen.getByRole("button", { name: "Entrar B" }));
    await screen.findByDisplayValue("Beatriz");
    expect(old.init.signal?.aborted).toBe(true);
    await act(async () => { reading.resolve(json(profiles.get("one"))); });
    expect(document.querySelectorAll('[data-profile-avatar="sun"]')).toHaveLength(2);
    expect(document.querySelectorAll('[data-profile-avatar="leaf"]')).toHaveLength(0);
    expect(client.getQueryData(userProfileKey("one"))).toBeUndefined();
    expect(requests.map((item) => item.path)).toEqual(["/api/users/one/profile", "/api/users/two/profile"]);
    expect(screen.getByLabelText("Token de sesión")).toHaveTextContent("token-two");
  });

  it("logout aborta GET SELF y descarta el avatar de una respuesta tardía", async () => {
    const reading = deferred<Response>();
    override = (path) => path === "/api/users/one/profile" ? reading.promise : undefined;
    const { client } = mountAvatar();
    await userEvent.click(screen.getByRole("button", { name: "Entrar A" }));
    const old = requests[0];
    await userEvent.click(screen.getByRole("button", { name: "Salir de prueba" }));
    expect(old.init.signal?.aborted).toBe(true);
    await act(async () => { reading.resolve(json(profiles.get("one"))); });
    expect(document.querySelectorAll("[data-profile-avatar]")).toHaveLength(0);
    expect(client.getQueryData(userProfileKey("one"))).toBeUndefined();
    expect(screen.getByLabelText("Estado de sesión")).toHaveTextContent("unauthenticated");
    expect(requests.map((item) => item.path)).toEqual(["/api/users/one/profile", "/api/auth/logout"]);
  });
});

function render(ui: ReactElement) { return rtlRender(<QueryProvider>{ui}</QueryProvider>); }
