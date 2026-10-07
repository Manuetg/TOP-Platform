import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/context/AuthContext";
import type { LoginResponse, MembershipRole } from "../../auth/types/auth.types";
import { AUTH_SESSION_STORAGE_KEY } from "../../auth/storage/auth-session-storage";
import { BusinessProvider, useBusinessContext } from "../context/BusinessContext";
import { BusinessSelector } from "./BusinessSelector";
import { BusinessBoundary } from "./BusinessBoundary";
import { BusinessProfilePage } from "../pages/BusinessProfilePage";
import { ProtectedRoute, PublicRoute } from "../../../app/router/ProtectedRoute";
import { useResources } from "../../resources/queries/use-resources";
import type { Business } from "../types/business.types";
import { requestUrl } from "../../../../tests/request-url";

const business = (id: string): Business => ({ id, name: `Posada ${id}`, legalName: null, taxId: null, country: null, region: null, city: null, address: null, currency: "PYG", timezone: "America/Asuncion", status: "ACTIVE", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
const session = (user = "one", role: MembershipRole = "OWNER"): LoginResponse => ({ accessToken: `token-${user}`, refreshToken: `refresh-${user}`, tokenType: "Bearer", expiresIn: 900, user: { id: user, email: `${user}@example.test`, status: "ACTIVE" }, memberships: [{ businessId: "a", role }, { businessId: "b", role }] });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
let role: MembershipRole;
let requests: { path: string; method: string; init: RequestInit }[];
let override: (path: string, init: RequestInit) => Promise<Response> | Response | undefined;
const clients: QueryClient[] = [];
function AuthControls() {
  const auth = useAuth();
  return <><output aria-label="Auth">{auth.status}</output><button onClick={() => auth.establishSession(session("one", role))}>Login A</button><button onClick={() => auth.establishSession(session("two", role))}>Login B</button><button onClick={() => { void auth.logout(); }}>Logout</button></>;
}
function Tenant() {
  const context = useBusinessContext(); const { session: current } = useAuth();
  const resources = useResources({ businessId: context.activeBusinessId, accessToken: current?.accessToken });
  return <><output aria-label="Activo">{context.activeBusinessId}</output><BusinessSelector /><BusinessProfilePage key={current?.user.id} /><BusinessBoundary><output aria-label="Recursos">{resources.data?.map((item) => item.name).join(",")}</output></BusinessBoundary></>;
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><AuthProvider><AuthControls /><BusinessProvider><MemoryRouter initialEntries={["/app"]}><Routes><Route path="/app" element={<ProtectedRoute><Tenant /></ProtectedRoute>} /><Route path="/login" element={<PublicRoute />}><Route index element={<h1>Login route</h1>} /></Route></Routes></MemoryRouter></BusinessProvider></AuthProvider></QueryClientProvider>);
  return { client, ...view };
}
async function login() { await userEvent.click(screen.getByRole("button", { name: "Login A" })); await screen.findAllByRole("button", { name: "Posada a" }); }
async function choose(id: string) { await userEvent.click(screen.getAllByRole("button", { name: `Posada ${id}` })[0]); }
async function ready() { await login(); await choose("a"); await screen.findByDisplayValue("Posada a"); }

describe("Business Management con Auth, QueryClient y HTTP reales", () => {
  beforeEach(() => {
    sessionStorage.clear(); localStorage.clear(); role = "OWNER"; requests = []; override = () => undefined;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname; requests.push({ path, method: init.method ?? "GET", init });
      const custom = override(path, init); if (custom) return custom;
      if (path.endsWith("/auth/logout")) return Promise.resolve(new Response(null, { status: 204 }));
      if (/\/users\/[^/]+\/profile$/.test(path)) { const id = path.split("/").at(-2); return Promise.resolve(json({ id, email: `${id}@example.test`, displayName: "Ana", status: "ACTIVE", updatedAt: "2026-09-30T12:00:00.000Z" })); }
      if (path.endsWith("/subscription")) return Promise.resolve(json({ subscription: { planCode: "TOP_INITIAL", planName: "TOP Inicial" }, entitlements: { maxResources: 10 }, usage: { resources: { used: 0, available: 10, percentage: 0, state: "NORMAL", canCreate: true } }, upgrade: { status: "AVAILABLE", requestedAt: null } }));
      if (path.endsWith("/businesses")) return Promise.resolve(json([business("a"), business("b")]));
      if (path.endsWith("/resources")) return Promise.resolve(json([{ name: `Recurso ${path.includes("/a/") ? "a" : "b"}` }]));
      return Promise.resolve(json(business(path.endsWith("/a") ? "a" : "b")));
    }));
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

  it("Configuración permite consultar y guardar la cuenta sin Business disponible y no inicia consultas operativas", async () => {
    override = (path, init) => {
      if (path.endsWith("/businesses")) return json([]);
      if (path.endsWith("/users/one/profile") && init.method === "PATCH") return json({ id: "one", email: "one@example.test", displayName: "Cuenta sin negocio", status: "ACTIVE", updatedAt: "2026-09-30T12:00:00.001Z" });
    };
    mount(); await userEvent.click(screen.getByRole("button", { name: "Login A" }));
    await screen.findByDisplayValue("Ana");
    await waitFor(() => expect(screen.getAllByText("No tenés un negocio activo disponible.").length).toBeGreaterThan(0));
    expect(screen.getByRole("heading", { name: "Configuración" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Tu cuenta" })).toBeInTheDocument();
    expect(screen.getByText("one@example.test")).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre del establecimiento")).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Plan y capacidad" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Activo")).toBeEmptyDOMElement();

    await userEvent.clear(screen.getByLabelText("Nombre completo")); await userEvent.type(screen.getByLabelText("Nombre completo"), "Cuenta sin negocio");
    expect(screen.queryByLabelText("Motivo del cambio")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(JSON.parse(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)!).user.displayName).toBe("Cuenta sin negocio");
    const patch = requests.find((item) => item.method === "PATCH")!;
    expect(patch.path).toBe("/api/users/one/profile");
    expect(JSON.parse(String(patch.init.body))).toEqual({ displayName: "Cuenta sin negocio", birthYear: null, username: null, phone: null, avatarId: null, expectedUpdatedAt: "2026-09-30T12:00:00.000Z" });
    expect(requests.filter((item) => item.path.includes("/businesses/") || item.path.endsWith("/resources") || item.path.includes("/subscription"))).toHaveLength(0);
  });

  it("la cuenta está visible mientras se elige Business y sus consultas esperan el estado ready", async () => {
    mount(); await login(); await screen.findByDisplayValue("Ana");
    expect(screen.getByRole("heading", { name: "Tu cuenta" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre del establecimiento")).not.toBeInTheDocument();
    expect(requests.filter((item) => item.path.includes("/businesses/"))).toHaveLength(0);

    await choose("a"); await screen.findByDisplayValue("Posada a");

    expect(requests.some((item) => item.path.endsWith("/businesses/a"))).toBe(true);
  });

  it.each(["Business", "identidad"])("cancela %s A, resuelve B y descarta efectivamente respuestas tardías de A", async (change) => {
    const oldProfile = deferred<Response>(); const oldResources = deferred<Response>();
    override = (path, init) => {
      const oldToken = new Headers(init.headers).get("Authorization") === "Bearer token-one";
      if (oldToken && path.endsWith("/businesses/a")) return oldProfile.promise;
      if (oldToken && path.endsWith("/businesses/a/resources")) return oldResources.promise;
    };
    const { client } = mount(); client.setQueryData(["unrelated"], "conservar");
    await login(); await choose("a");
    await waitFor(() => expect(requests.filter((item) => /\/businesses\/a(?:\/resources)?$/.test(item.path))).toHaveLength(2));
    const old = requests.filter((item) => /\/businesses\/a(?:\/resources)?$/.test(item.path));
    if (change === "Business") await choose("b");
    else { await userEvent.click(screen.getByRole("button", { name: "Login B" })); await screen.findAllByRole("button", { name: "Posada a" }); await choose("a"); }
    await screen.findByDisplayValue(change === "Business" ? "Posada b" : "Posada a");
    await waitFor(() => expect(screen.getByLabelText("Recursos")).toHaveTextContent(change === "Business" ? "Recurso b" : "Recurso a"));
    expect(old.every((item) => item.init.signal?.aborted)).toBe(true);
    await act(async () => { oldProfile.resolve(json({ ...business("a"), name: "ANTIGUO A" })); oldResources.resolve(json([{ name: "ANTIGUO A" }])); });
    expect(screen.queryByDisplayValue("ANTIGUO A")).not.toBeInTheDocument(); expect(screen.queryByText("ANTIGUO A")).not.toBeInTheDocument();
    expect(client.getQueryData(["unrelated"])).toBe("conservar");
    if (change === "Business") expect(client.getQueryData(["resources", "a"])).toBeUndefined();
  });

  it.each(["logout", "desmontaje"])("%s aborta lecturas y no resucita datos ni sesión", async (exit) => {
    const profile = deferred<Response>(); const resources = deferred<Response>();
    override = (path) => path.endsWith("/businesses/a") ? profile.promise : path.endsWith("/a/resources") ? resources.promise : undefined;
    const view = mount(); await login(); await choose("a");
    await waitFor(() => expect(requests.filter((item) => /\/businesses\/a(?:\/resources)?$/.test(item.path))).toHaveLength(2));
    const old = requests.filter((item) => /\/businesses\/a(?:\/resources)?$/.test(item.path));
    if (exit === "logout") { await userEvent.click(screen.getByRole("button", { name: "Logout" })); await screen.findByRole("heading", { name: "Login route" }); expect(screen.getByLabelText("Auth")).toHaveTextContent("unauthenticated"); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); }
    else view.unmount();
    expect(old.every((item) => item.init.signal?.aborted)).toBe(true);
    await act(async () => { profile.resolve(json({ ...business("a"), name: "ANTIGUO" })); resources.resolve(json([{ name: "ANTIGUO" }])); });
    expect(screen.queryByRole("region", { name: "Perfil del establecimiento" })).not.toBeInTheDocument();
    expect(view.client.getQueryData(["resources", "a"])).toBeUndefined();
    if (exit === "logout") { expect(view.client.getQueryCache().getAll()).toHaveLength(0); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); }
  });

  it("una identidad nueva no hereda caché de un Business inactivo de la identidad anterior", async () => {
    const pending = deferred<Response>();
    const { client } = mount(); await ready();
    client.setQueryData(["resources", "b"], [{ name: "PRIVADO OTRA IDENTIDAD" }]);
    client.setQueryData(["unrelated"], "conservar");
    override = (path, init) => path.endsWith("/b/resources") && new Headers(init.headers).get("Authorization") === "Bearer token-two" ? pending.promise : undefined;
    await userEvent.click(screen.getByRole("button", { name: "Login B" }));
    await screen.findAllByRole("button", { name: "Posada b" }); await choose("b");
    await screen.findByDisplayValue("Posada b");
    expect(screen.queryByText("PRIVADO OTRA IDENTIDAD")).not.toBeInTheDocument(); expect(client.getQueryData(["resources", "b"])).toBeUndefined();
    await act(async () => pending.resolve(json([{ name: "Dato autorizado nuevo" }])));
    await waitFor(() => expect(screen.getByLabelText("Recursos")).toHaveTextContent("Dato autorizado nuevo"));
    expect(client.getQueryData(["unrelated"])).toBe("conservar");
  });

  it.each(["lectura", "solicitud"])("logout real cancela Subscription pendiente (%s), limpia caché y descarta su respuesta", async (operation) => {
    const pending = deferred<Response>(); const { client } = mount(); await ready();
    await screen.findByRole("button", { name: "Solicitar ampliación" });
    const suffix = operation === "lectura" ? "/subscription" : "/subscription/upgrade-request";
    override = (path) => path.endsWith(suffix) ? pending.promise : undefined;
    const previous = requests.length;
    if (operation === "lectura") act(() => { void client.refetchQueries({ queryKey: ["subscription", "one", "a"] }); });
    else await userEvent.click(screen.getByRole("button", { name: "Solicitar ampliación" }));
    await waitFor(() => expect(requests.slice(previous).some((item) => item.path.endsWith(suffix))).toBe(true));
    const request = requests.slice(previous).find((item) => item.path.endsWith(suffix))!;
    await userEvent.click(screen.getByRole("button", { name: "Logout" })); await screen.findByRole("heading", { name: "Login route" });
    expect(request.init.signal?.aborted).toBe(true); expect(client.getQueryCache().getAll()).toHaveLength(0);
    await act(async () => pending.resolve(json(operation === "lectura" ? { subscription: { planCode: "OLD", planName: "Plan antiguo" } } : { status: "REQUESTED", requestedAt: "2026-09-23T00:00:00Z" })));
    expect(screen.queryByRole("region", { name: "Plan y capacidad" })).not.toBeInTheDocument();
    expect(client.getQueryCache().getAll()).toHaveLength(0); expect(client.getMutationCache().getAll()).toHaveLength(0);
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); expect(screen.getByLabelText("Auth")).toHaveTextContent("unauthenticated");
  });

  it("guarda una vez, normaliza opcionales y actualiza el nombre activo sin perder otra caché", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const { client } = mount(); client.setQueryData(["unrelated"], "conservar"); await ready();
    await userEvent.clear(screen.getByLabelText("Nombre del establecimiento")); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Posada renovada");
    const save = within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }); await userEvent.dblClick(save);
    await waitFor(() => expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1));
    const patch = requests.find((item) => item.method === "PATCH")!;
    expect(JSON.parse(String(patch.init.body))).toEqual({ name: "Posada renovada", legalName: null, taxId: null, timezone: "America/Asuncion", country: null, region: null, city: null, address: null, expectedUpdatedAt: business("a").updatedAt });
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus();
    await act(async () => saving.resolve(json({ ...business("a"), name: "Posada renovada" })));
    await screen.findByText("Cambios guardados."); expect(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus();
    expect(client.getQueryData<Business[]>(["businesses", "one"])?.[0].name).toBe("Posada renovada"); expect(client.getQueryData(["unrelated"])).toBe("conservar");
  });

  it("guarda identidad y ubicación opcional con versión sin enviar moneda ni motivo", async () => {
    let current = business("a");
    override = (path, init) => {
      if (!path.endsWith("/businesses/a")) return;
      if (init.method === "PATCH") {
        const { expectedUpdatedAt, ...values } = JSON.parse(String(init.body));
        if (expectedUpdatedAt !== current.updatedAt) return json({ message: "El establecimiento cambió." }, 409);
        current = { ...current, ...values, updatedAt: "2026-01-01T00:00:00.001Z" };
      }
      return json(current);
    };
    const { client } = mount(); await ready();
    expect(screen.getByText("Establecimiento activo: Posada a")).toBeInTheDocument();
    expect(screen.getByLabelText("Moneda")).toHaveAttribute("readonly");
    for (const [label, value] of [["Razón social (opcional)", " Empresa de prueba "], ["Identificación fiscal (opcional)", " Identificador sintético "], ["País (opcional)", " País de prueba "], ["Departamento o estado (opcional)", " Región de prueba "], ["Ciudad (opcional)", " Ciudad de prueba "], ["Dirección (opcional)", " Dirección de prueba "]]) {
      const input = screen.getByLabelText(label); expect(input).not.toBeRequired(); await userEvent.type(input, value);
    }
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Cambios guardados.");

    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body))).toEqual({ name: "Posada a", legalName: "Empresa de prueba", taxId: "Identificador sintético", timezone: "America/Asuncion", country: "País de prueba", region: "Región de prueba", city: "Ciudad de prueba", address: "Dirección de prueba", expectedUpdatedAt: business("a").updatedAt });
    await act(async () => { await client.refetchQueries({ queryKey: ["business-profile", "one", "a"] }); });
    expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Ciudad de prueba");
    expect(current.currency).toBe("PYG");
  });

  it("permite borrar ubicación e identidad opcional con null", async () => {
    const current = { ...business("a"), legalName: "Empresa de prueba", taxId: "Identificador sintético", country: "País de prueba", region: "Región de prueba", city: "Ciudad de prueba", address: "Dirección de prueba" };
    override = (path, init) => path.endsWith("/businesses/a") ? json(init.method === "PATCH" ? { ...business("a"), updatedAt: "2026-01-01T00:00:00.001Z" } : current) : undefined;
    mount(); await ready();
    for (const label of ["Razón social (opcional)", "Identificación fiscal (opcional)", "País (opcional)", "Departamento o estado (opcional)", "Ciudad (opcional)", "Dirección (opcional)"]) await userEvent.clear(screen.getByLabelText(label));
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Cambios guardados.");

    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body))).toEqual({ name: "Posada a", legalName: null, taxId: null, timezone: "America/Asuncion", country: null, region: null, city: null, address: null, expectedUpdatedAt: current.updatedAt });
    expect(screen.getByLabelText("Dirección (opcional)")).toHaveValue("");
  });

  it("409 conserva ubicación y nombre del borrador hasta consultar y descartar explícitamente", async () => {
    let current = business("a");
    override = (path, init) => {
      if (!path.endsWith("/businesses/a")) return;
      if (init.method === "PATCH") {
        const { expectedUpdatedAt, ...values } = JSON.parse(String(init.body));
        if (expectedUpdatedAt !== current.updatedAt) return json({ message: "El establecimiento cambió." }, 409);
        current = { ...current, ...values, updatedAt: "2026-01-01T00:00:01.001Z" };
      }
      return json(current);
    };
    mount(); await ready();
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " borrador");
    await userEvent.type(screen.getByLabelText("Ciudad (opcional)"), "Ciudad local");
    current = { ...business("a"), name: "Nombre remoto", legalName: "Empresa remota", taxId: "Id remoto", country: "País remoto", region: "Región remota", city: "Ciudad remota", address: "Dirección remota", updatedAt: "2026-01-01T00:00:01.000Z" };
    const form = screen.getByRole("form", { name: "Datos del establecimiento" });
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/La información del establecimiento cambió/);
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada a borrador");
    expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Ciudad local");
    expect(within(form).getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(within(form).getByRole("button", { name: "Descartar cambios" })).toBeDisabled();

    within(form).getByRole("button", { name: "Consultar establecimiento actual" }).focus(); await userEvent.keyboard("{Enter}");
    const consulted = await screen.findByRole("region", { name: "Establecimiento actual consultado" });
    expect(consulted).toHaveTextContent("Nombre remoto"); expect(consulted).toHaveTextContent("País remoto"); expect(consulted).toHaveTextContent("Ciudad remota"); expect(consulted).toHaveTextContent("Dirección remota");
    expect(form).toHaveFocus();
    expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Ciudad local");
    await userEvent.click(within(form).getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Nombre remoto"); expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Ciudad remota");
    await userEvent.type(screen.getByLabelText("Ciudad (opcional)"), " revisada");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Cambios guardados.");
    const patches = requests.filter((item) => item.method === "PATCH");
    expect(JSON.parse(String(patches[0].init.body)).expectedUpdatedAt).toBe(business("a").updatedAt);
    expect(JSON.parse(String(patches[1].init.body)).expectedUpdatedAt).toBe("2026-01-01T00:00:01.000Z");
    expect(current.city).toBe("Ciudad remota revisada");
  });

  it("un refetch durante edición conserva la versión original y consulta actual antes del reintento", async () => {
    let current = business("a");
    override = (path, init) => path.endsWith("/businesses/a") ? init.method === "PATCH" ? json({ message: "El establecimiento cambió." }, 409) : json(current) : undefined;
    const { client } = mount(); await ready();
    await userEvent.type(screen.getByLabelText("Ciudad (opcional)"), "Ciudad local");
    current = { ...business("a"), city: "Ciudad remota", updatedAt: "2026-01-01T00:00:01.000Z" };
    await act(async () => { await client.refetchQueries({ queryKey: ["business-profile", "one", "a"] }); });
    expect(screen.getByLabelText("Ciudad (opcional)")).toHaveValue("Ciudad local");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/La información del establecimiento cambió/);
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body)).expectedUpdatedAt).toBe(business("a").updatedAt);
  });

  it("un GET de lista tardío no restaura nombre ni zona horaria anteriores al guardado", async () => {
    const { client } = mount(); await ready();
    client.setQueryData(["unrelated"], "conservar");
    const old = deferred<Response>();
    const updated = { ...business("a"), name: "Posada guardada", timezone: "UTC", updatedAt: "2026-01-01T00:00:00.001Z" };
    override = (path, init) => path.endsWith("/businesses") && !init.method ? old.promise : path.endsWith("/businesses/a") && init.method === "PATCH" ? json(updated) : undefined;
    let reading!: Promise<unknown>;
    act(() => { reading = client.refetchQueries({ queryKey: ["businesses", "one"], exact: true }); });
    await waitFor(() => expect(requests.filter((item) => item.path.endsWith("/businesses"))).toHaveLength(2));
    const previousGet = requests.filter((item) => item.path.endsWith("/businesses")).at(-1)!;
    await userEvent.clear(screen.getByLabelText("Nombre del establecimiento")); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Posada guardada");
    await userEvent.clear(screen.getByLabelText("Zona horaria")); await userEvent.type(screen.getByLabelText("Zona horaria"), "UTC");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Cambios guardados.");
    expect(previousGet.init.signal?.aborted).toBe(true);
    await act(async () => { old.resolve(json([business("a"), business("b")])); await reading; });

    expect(client.getQueryData<Business[]>(["businesses", "one"])).toEqual([updated, business("b")]);
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada guardada");
    expect(screen.getByLabelText("Zona horaria")).toHaveValue("UTC");
    expect(screen.getAllByRole("button", { name: "Posada guardada" }).length).toBeGreaterThan(0);
    expect(client.getQueryData(["unrelated"])).toBe("conservar");
  });

  it("dirección demasiado larga muestra error asociado y conserva la entrada completa", async () => {
    mount(); await ready();
    const input = screen.getByLabelText("Dirección (opcional)");
    const user = userEvent.setup();
    await user.click(input);
    await user.paste("a".repeat(501));
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Usa hasta 500 caracteres.");
    expect(input).toHaveValue("a".repeat(501));
    expect(input).toHaveAttribute("aria-invalid", "true"); expect(input).toHaveAttribute("aria-describedby", "business-address-error");
    expect(requests.some((item) => item.method === "PATCH")).toBe(false);
  });

  it.each(["VIEWER", "RECEPTIONIST"] as const)("%s consulta pero no puede enviar cambios", async (currentRole) => {
    role = currentRole; mount(); await ready(); expect(screen.getByLabelText("Nombre del establecimiento")).toHaveAttribute("readonly"); expect(within(screen.getByRole("form", { name: "Datos del establecimiento" })).queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument(); expect(requests.some((item) => item.method === "PATCH")).toBe(false);
    for (const label of ["País (opcional)", "Departamento o estado (opcional)", "Ciudad (opcional)", "Dirección (opcional)"]) expect(screen.getByLabelText(label)).toHaveAttribute("readonly");
  });

  it.each([403, 404])("retira campos ante %s del perfil", async (status) => {
    override = (path) => path.endsWith("/businesses/a") ? json({ message: "Sin acceso" }, status) : undefined;
    mount(); await login(); await choose("a"); await screen.findByRole("alert"); expect(screen.queryByLabelText("Nombre del establecimiento")).not.toBeInTheDocument();
  });

  it("conserva edición ante refresh de la misma sesión y reintenta GET con token nuevo", async () => {
    let refreshNeeded = false;
    override = (path, init) => {
      if (path.endsWith("/auth/refresh")) return json({ accessToken: "token-renovado", refreshToken: "refresh-renovado", tokenType: "Bearer", expiresIn: 900 });
      if (refreshNeeded && path.endsWith("/businesses/a") && new Headers(init.headers).get("Authorization") === "Bearer token-one") return json({ message: "Expirado" }, 401);
    };
    const { client } = mount(); await ready(); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " editada");
    refreshNeeded = true; await act(async () => { await client.refetchQueries({ queryKey: ["business-profile", "one", "a"] }); });
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada a editada");
    expect(new Headers(requests.filter((item) => item.path.endsWith("/businesses/a")).at(-1)?.init.headers).get("Authorization")).toBe("Bearer token-renovado");
  });

  it("valida campos y presenta rechazo de servidor conservando la edición", async () => {
    override = (_path, init) => init.method === "PATCH" ? json({ message: "La actualización no es válida." }, 400) : undefined;
    mount(); await ready(); await userEvent.clear(screen.getByLabelText("Nombre del establecimiento")); await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Ingresa el nombre del establecimiento."); expect(requests.some((item) => item.method === "PATCH")).toBe(false);
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Corregida"); await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("La actualización no es válida."); expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Corregida"); expect(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("un rechazo de zona horaria conserva borrador y versión para guardar metadata con la zona vigente", async () => {
    const current = business("a");
    const updated = { ...current, name: "Posada metadata", city: "Ciudad de prueba", updatedAt: "2026-01-01T00:00:00.001Z" };
    const rejection = "No se puede cambiar la zona horaria de un establecimiento con recursos, reservas, bloqueos o pagos registrados. Conserva la zona horaria actual para guardar los demás datos.";
    let attempts = 0;
    override = (path, init) => {
      if (!path.endsWith("/businesses/a")) return;
      if (init.method === "PATCH") return ++attempts === 1 ? json({ message: rejection }, 400) : json(updated);
      return json(current);
    };
    const { client } = mount(); await ready();
    const form = screen.getByRole("form", { name: "Datos del establecimiento" });
    const name = within(form).getByLabelText("Nombre del establecimiento");
    const city = within(form).getByLabelText("Ciudad (opcional)");
    const timezone = within(form).getByLabelText("Zona horaria");
    await userEvent.clear(name); await userEvent.type(name, updated.name);
    await userEvent.type(city, updated.city);
    await userEvent.clear(timezone); await userEvent.type(timezone, "UTC");
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));

    expect(await within(form).findByRole("alert")).toHaveTextContent(rejection);
    expect(name).toHaveValue(updated.name); expect(city).toHaveValue(updated.city); expect(timezone).toHaveValue("UTC");
    for (const input of [name, city, timezone]) { expect(input).toBeEnabled(); expect(input).not.toHaveAttribute("readonly"); }
    expect(within(form).getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(within(form).queryByRole("button", { name: "Consultar establecimiento actual" })).not.toBeInTheDocument();
    expect(client.getQueryData<Business>(["business-profile", "one", "a"])).toEqual(current);
    expect(client.getQueryData<Business[]>(["businesses", "one"])?.[0]).toEqual(current);
    const firstPatch = requests.find((item) => item.path.endsWith("/businesses/a") && item.method === "PATCH")!;
    expect(JSON.parse(String(firstPatch.init.body))).toMatchObject({ name: updated.name, city: updated.city, timezone: "UTC", expectedUpdatedAt: current.updatedAt });

    await userEvent.clear(timezone); await userEvent.type(timezone, current.timezone);
    await userEvent.click(within(form).getByRole("button", { name: "Guardar cambios" }));
    await within(form).findByText("Cambios guardados.");
    const patches = requests.filter((item) => item.path.endsWith("/businesses/a") && item.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(JSON.parse(String(patches[1].init.body))).toMatchObject({ name: updated.name, city: updated.city, timezone: current.timezone, expectedUpdatedAt: current.updatedAt });
    expect(name).toHaveValue(updated.name); expect(city).toHaveValue(updated.city); expect(timezone).toHaveValue(current.timezone);
    expect(client.getQueryData<Business>(["business-profile", "one", "a"])).toEqual(updated);
    expect(client.getQueryData<Business[]>(["businesses", "one"])?.[0]).toEqual(updated);
    expect(within(form).getByLabelText("Moneda")).toHaveValue("PYG");
    expect(within(form).queryByRole("alert")).not.toBeInTheDocument();
    expect(within(form).getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("una respuesta de guardado no roba foco después de salir a otro control", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    mount(); await ready(); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " nueva");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus());
    const active = screen.getAllByRole("button", { name: "Posada a" })[0]; active.focus();
    await act(async () => saving.resolve(json({ ...business("a"), name: "Posada a nueva" })));
    await screen.findByText("Cambios guardados."); expect(active).toHaveFocus();
  });

  it("cambiar Business durante PATCH aborta y no modifica el perfil nuevo al llegar la respuesta", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const { client } = mount(); await ready(); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " nueva");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1));
    const pending = requests.find((item) => item.method === "PATCH")!;
    await choose("b"); await screen.findByDisplayValue("Posada b"); expect(pending.init.signal?.aborted).toBe(true);
    await act(async () => saving.resolve(json({ ...business("a"), name: "ANTIGUO" })));
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada b"); expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(client.getQueryData(["business-profile", "one", "a"])).toBeUndefined();
  });

  it("cambiar Business conserva el borrador global del perfil mientras actualiza el establecimiento", async () => {
    mount(); await ready(); await screen.findByDisplayValue("Ana");
    await userEvent.clear(screen.getByLabelText("Nombre completo"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana borrador global");
    await userEvent.type(screen.getByLabelText("Nombre de usuario (opcional)"), "alias-pendiente");
    const storedSession = sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY);

    await choose("b"); await screen.findByDisplayValue("Posada b");

    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Ana borrador global");
    expect(screen.getByLabelText("Nombre de usuario (opcional)")).toHaveValue("alias-pendiente");
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada b");
    expect(within(screen.getByRole("form", { name: "Datos de tu cuenta" })).getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
    expect(requests.some((item) => item.method === "PATCH")).toBe(false);
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(storedSession);
  });

  it("retira el éxito cuando se inicia un nuevo borrador", async () => {
    override = (_path, init) => init.method === "PATCH" ? json({ ...business("a"), name: "Posada guardada" }) : undefined;
    mount(); await ready();
    await userEvent.clear(screen.getByLabelText("Nombre del establecimiento"));
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Posada guardada");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Cambios guardados.");
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " pendiente");
    expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
  });

  it("un refetch actualiza campos limpios y conserva un borrador sin guardar", async () => {
    const { client } = mount(); await ready();
    override = (path, init) => path.endsWith("/businesses/a") && !init.method ? json({ ...business("a"), name: "Nombre actualizado" }) : undefined;
    await act(async () => { await client.refetchQueries({ queryKey: ["business-profile", "one", "a"] }); });
    await waitFor(() => expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Nombre actualizado"));
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " borrador");
    override = (path, init) => path.endsWith("/businesses/a") && !init.method ? json({ ...business("a"), name: "Otro cambio remoto" }) : undefined;
    await act(async () => { await client.refetchQueries({ queryKey: ["business-profile", "one", "a"] }); });
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Nombre actualizado borrador");
  });

  it.each([403, 404])("rechazo PATCH %s ofrece una reconsulta real", async (status) => {
    override = (path, init) => path.endsWith("/businesses/a") && init.method === "PATCH" ? json({ message: "Acceso rechazado" }, status) : undefined;
    mount(); await ready();
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " editada");
    await userEvent.click(within(screen.getByRole("form", { name: "Datos del establecimiento" })).getByRole("button", { name: "Guardar cambios" }));
    const reload = await screen.findByRole("button", { name: "Actualizar establecimiento" });
    expect(screen.queryByLabelText("Nombre del establecimiento")).not.toBeInTheDocument();
    const before = requests.filter((item) => item.path.endsWith("/businesses/a") && item.method === "GET").length;
    await userEvent.click(reload);
    await screen.findByLabelText("Nombre del establecimiento");
    expect(requests.filter((item) => item.path.endsWith("/businesses/a") && item.method === "GET")).toHaveLength(before + 1);
  });
});
