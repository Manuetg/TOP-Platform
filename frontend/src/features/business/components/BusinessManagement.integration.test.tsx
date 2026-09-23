import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
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

const business = (id: string): Business => ({ id, name: `Posada ${id}`, legalName: null, taxId: null, currency: "PYG", timezone: "America/Asuncion", status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" });
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
  return <><output aria-label="Activo">{context.activeBusinessId}</output><BusinessSelector /><BusinessBoundary><BusinessProfilePage key={`${current?.user.id}:${context.activeBusinessId}`} /><output aria-label="Recursos">{resources.data?.map((item) => item.name).join(",")}</output></BusinessBoundary></>;
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
    sessionStorage.clear(); role = "OWNER"; requests = []; override = () => undefined;
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname; requests.push({ path, method: init.method ?? "GET", init });
      const custom = override(path, init); if (custom) return custom;
      if (path.endsWith("/auth/logout")) return Promise.resolve(new Response(null, { status: 204 }));
      if (path.endsWith("/businesses")) return Promise.resolve(json([business("a"), business("b")]));
      if (path.endsWith("/resources")) return Promise.resolve(json([{ name: `Recurso ${path.includes("/a/") ? "a" : "b"}` }]));
      return Promise.resolve(json(business(path.endsWith("/a") ? "a" : "b")));
    }));
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); sessionStorage.clear(); });

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
    await waitFor(() => expect(requests.filter((item) => item.path.includes("/businesses/a"))).toHaveLength(2));
    const old = requests.filter((item) => item.path.includes("/businesses/a"));
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

  it("guarda una vez, normaliza opcionales y actualiza el nombre activo sin perder otra caché", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const { client } = mount(); client.setQueryData(["unrelated"], "conservar"); await ready();
    await userEvent.clear(screen.getByLabelText("Nombre del establecimiento")); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Posada renovada");
    const save = screen.getByRole("button", { name: "Guardar cambios" }); await userEvent.dblClick(save);
    await waitFor(() => expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1));
    const patch = requests.find((item) => item.method === "PATCH")!;
    expect(JSON.parse(String(patch.init.body))).toEqual({ name: "Posada renovada", legalName: null, taxId: null, timezone: "America/Asuncion" });
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus();
    await act(async () => saving.resolve(json({ ...business("a"), name: "Posada renovada" })));
    await screen.findByText("Cambios guardados."); expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus();
    expect(client.getQueryData<Business[]>(["businesses", "one"])?.[0].name).toBe("Posada renovada"); expect(client.getQueryData(["unrelated"])).toBe("conservar");
  });

  it.each(["VIEWER", "RECEPTIONIST"] as const)("%s consulta pero no puede enviar cambios", async (currentRole) => {
    role = currentRole; mount(); await ready(); expect(screen.getByLabelText("Nombre del establecimiento")).toHaveAttribute("readonly"); expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument(); expect(requests.some((item) => item.method === "PATCH")).toBe(false);
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
    mount(); await ready(); await userEvent.clear(screen.getByLabelText("Nombre del establecimiento")); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Ingresá el nombre del establecimiento."); expect(requests.some((item) => item.method === "PATCH")).toBe(false);
    await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), "Corregida"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("La actualización no es válida."); expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Corregida"); expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled();
  });

  it("una respuesta de guardado no roba foco después de salir a otro control", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    mount(); await ready(); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " nueva");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(screen.getByRole("form", { name: "Datos del establecimiento" })).toHaveFocus());
    const active = screen.getAllByRole("button", { name: "Posada a" })[0]; active.focus();
    await act(async () => saving.resolve(json({ ...business("a"), name: "Posada a nueva" })));
    await screen.findByText("Cambios guardados."); expect(active).toHaveFocus();
  });

  it("cambiar Business durante PATCH aborta y no modifica el perfil nuevo al llegar la respuesta", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const { client } = mount(); await ready(); await userEvent.type(screen.getByLabelText("Nombre del establecimiento"), " nueva");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1));
    const pending = requests.find((item) => item.method === "PATCH")!;
    await choose("b"); await screen.findByDisplayValue("Posada b"); expect(pending.init.signal?.aborted).toBe(true);
    await act(async () => saving.resolve(json({ ...business("a"), name: "ANTIGUO" })));
    expect(screen.getByLabelText("Nombre del establecimiento")).toHaveValue("Posada b"); expect(screen.queryByText("Cambios guardados.")).not.toBeInTheDocument();
    expect(client.getQueryData(["business-profile", "one", "a"])).toBeUndefined();
  });
});
