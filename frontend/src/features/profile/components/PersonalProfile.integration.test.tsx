import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/context/AuthContext";
import { AUTH_SESSION_STORAGE_KEY } from "../../auth/storage/auth-session-storage";
import type { LoginResponse, MembershipRole } from "../../auth/types/auth.types";
import { PersonalProfile } from "./PersonalProfile";
import { userProfileKey } from "../queries/use-user-profile";
import type { UserProfile } from "../api/user-profile";
import { requestUrl } from "../../../../tests/request-url";

const session = (id: string): LoginResponse => ({ accessToken: `token-${id}`, refreshToken: `refresh-${id}`, tokenType: "Bearer", expiresIn: 900, user: { id, email: `${id}@example.test`, displayName: "Nombre de sesión antiguo", status: "ACTIVE" }, memberships: [{ businessId: "business-a", role }] });
const initial = (id: string): UserProfile => ({ id, email: `${id}@example.test`, displayName: id === "one" ? "Ana" : "Beatriz", birthYear: null, username: null, phone: null, avatarId: null, status: "ACTIVE", updatedAt: "2026-09-30T12:00:00.000Z" });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
let role: MembershipRole;
let profiles: Map<string, UserProfile>;
let requests: { path: string; method: string; init: RequestInit }[];
let override: (path: string, init: RequestInit) => Promise<Response> | Response | undefined;
const clients: QueryClient[] = [];
function Controls() {
  const auth = useAuth();
  const replacement = { ...session("one"), accessToken: "token-reemplazo", refreshToken: "refresh-reemplazo", user: { ...session("one").user, displayName: "Nombre de la sesión nueva" } };
  return <><button onClick={() => auth.establishSession(session("one"))}>Entrar uno</button><button onClick={() => auth.establishSession(session("one"), "PERSISTENT")}>Entrar persistente</button><button onClick={() => auth.establishSession(session("two"))}>Entrar dos</button><button onClick={() => auth.establishSession(replacement, "PERSISTENT")}>Reemplazar sesión uno</button><button onClick={() => { void auth.logout(); }}>Salir</button><output aria-label="Sesión">{auth.status}</output><output aria-label="Nombre en sesión">{auth.session?.user.displayName}</output><output aria-label="Token en sesión">{auth.session?.accessToken}</output></>;
}
function ConnectedProfile() {
  const { updateUserProfile } = useAuth();
  return <PersonalProfile onSaved={updateUserProfile} />;
}
function mount(onSaved = vi.fn(), connected = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } }); clients.push(client);
  const view = render(<QueryClientProvider client={client}><AuthProvider><Controls />{connected ? <ConnectedProfile /> : <PersonalProfile onSaved={onSaved} />}</AuthProvider></QueryClientProvider>);
  return { ...view, client, onSaved };
}
async function ready() { const view = mount(); await userEvent.click(screen.getByRole("button", { name: "Entrar uno" })); await screen.findByDisplayValue("Ana"); return view; }
async function changeName(value: string) { await userEvent.clear(screen.getByLabelText("Nombre completo")); await userEvent.type(screen.getByLabelText("Nombre completo"), value);  }

describe("Perfil personal con Auth, QueryClient y HTTP", () => {
  beforeEach(() => {
    role = "OWNER"; profiles = new Map([["one", initial("one")], ["two", initial("two")]]); requests = []; override = () => undefined;
    sessionStorage.clear(); localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const path = requestUrl(input instanceof Request ? input.url : input).pathname;
      requests.push({ path, method: init.method ?? "GET", init });
      const custom = override(path, init); if (custom) return custom;
      if (path.endsWith("/auth/logout")) return new Response(null, { status: 204 });
      if (path.endsWith("/auth/refresh")) return json({ accessToken: "token-restaurado", refreshToken: "refresh-restaurado", tokenType: "Bearer", expiresIn: 900 });
      const id = path.split("/").at(-2)!;
      if (init.method === "PATCH") {
        const body = JSON.parse(String(init.body)); const current = profiles.get(id)!;
        if (body.expectedUpdatedAt !== current.updatedAt) return json({ message: "El perfil cambió." }, 409);
        profiles.set(id, { ...current, displayName: body.displayName.trim(), birthYear: body.birthYear, username: body.username, phone: body.phone, avatarId: body.avatarId, updatedAt: new Date(Date.parse(current.updatedAt) + 1).toISOString() });
      }
      return json(profiles.get(id));
    }));
  });
  afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); sessionStorage.clear(); localStorage.clear(); });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"] as const)("%s guarda su nombre sin modificar correo ni permisos", async (currentRole) => {
    role = currentRole; const view = await ready();
    expect(screen.getByText("one@example.test")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Correo electrónico" })).not.toBeInTheDocument();
    expect(screen.getByText(/Su cambio todavía no está disponible/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Motivo del cambio")).not.toBeInTheDocument();
    await changeName("  Ana renovada  "); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    const patch = requests.find((item) => item.method === "PATCH")!;
    expect(JSON.parse(String(patch.init.body))).toEqual({ displayName: "Ana renovada", birthYear: null, username: null, phone: null, avatarId: null, expectedUpdatedAt: initial("one").updatedAt });
    expect(new Headers(patch.init.headers).get("Authorization")).toBe("Bearer token-one");
    expect(view.onSaved).toHaveBeenCalledWith({ ...initial("one"), displayName: "Ana renovada", updatedAt: "2026-09-30T12:00:00.001Z" });
    expect(screen.getByRole("form", { name: "Datos de tu cuenta" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Nombre completo"), " pendiente");
    expect(screen.queryByText("Los cambios de tu cuenta se guardaron.")).not.toBeInTheDocument();
  });

  it("recargar obtiene el nombre persistido aunque el snapshot de sesión sea anterior", async () => {
    const view = await ready(); await changeName("Nombre persistido"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(profiles.get("one")?.displayName).toBe("Nombre persistido");
    view.unmount(); mount();
    await screen.findByDisplayValue("Nombre persistido");
    expect(screen.queryByDisplayValue("Nombre de sesión antiguo")).not.toBeInTheDocument();
    expect(requests.filter((item) => item.path.endsWith("/users/one/profile") && item.method === "GET")).toHaveLength(2);
  });

  it("guarda campos opcionales y avatar por teclado sin cambiar el correo de acceso", async () => {
    const view = await ready();
    const year = screen.getByLabelText("Año de nacimiento (opcional)");
    const alias = screen.getByLabelText("Nombre de usuario (opcional)");
    const phone = screen.getByLabelText("Teléfono (opcional)");
    expect(year).not.toBeRequired(); expect(alias).not.toBeRequired(); expect(phone).not.toBeRequired();
    expect(year).toHaveAttribute("autocomplete", "bday-year");
    expect(phone).toHaveAttribute("type", "tel");
    expect(screen.getByRole("radiogroup", { name: "Avatar de perfil (opcional)" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Sin avatar" })).toBeChecked();
    await userEvent.type(year, "1990");
    await userEvent.type(alias, "  alias-prueba  ");
    await userEvent.type(phone, " +12025550123 ");
    const avatar = screen.getByRole("radio", { name: "Hoja" }); avatar.focus(); await userEvent.keyboard(" ");
    expect(avatar).toBeChecked();
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body))).toEqual({ displayName: "Ana", birthYear: 1990, username: "alias-prueba", phone: "+12025550123", avatarId: "leaf", expectedUpdatedAt: initial("one").updatedAt });
    expect(profiles.get("one")).toEqual({ ...initial("one"), birthYear: 1990, username: "alias-prueba", phone: "+12025550123", avatarId: "leaf", updatedAt: "2026-09-30T12:00:00.001Z" });
    expect(view.onSaved).toHaveBeenCalledOnce();
    expect(screen.getByText("one@example.test")).toBeInTheDocument();
    view.unmount(); mount();
    await screen.findByDisplayValue("alias-prueba");
    expect(screen.getByLabelText("Año de nacimiento (opcional)")).toHaveValue("1990");
    expect(screen.getByLabelText("Teléfono (opcional)")).toHaveValue("+12025550123");
    expect(screen.getByRole("radio", { name: "Hoja" })).toBeChecked();
  });

  it("limpia datos opcionales y avatar con null sin inventar valores", async () => {
    profiles.set("one", { ...initial("one"), birthYear: 1990, username: "alias-prueba", phone: "+12025550123", avatarId: "mountain" });
    await ready();
    await userEvent.clear(screen.getByLabelText("Año de nacimiento (opcional)"));
    await userEvent.clear(screen.getByLabelText("Nombre de usuario (opcional)"));
    await userEvent.clear(screen.getByLabelText("Teléfono (opcional)"));
    await userEvent.click(screen.getByRole("radio", { name: "Sin avatar" }));
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body))).toEqual({ displayName: "Ana", birthYear: null, username: null, phone: null, avatarId: null, expectedUpdatedAt: initial("one").updatedAt });
    expect(profiles.get("one")).toEqual({ ...initial("one"), updatedAt: "2026-09-30T12:00:00.001Z" });
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
  });

  it("conserva un teléfono pegado con formato internacional hasta su normalización backend", async () => {
    const user = userEvent.setup();
    await ready();
    override = (_path, init) => init.method === "PATCH" ? json({ ...initial("one"), phone: "+12025550123", updatedAt: "2026-09-30T12:00:00.001Z" }) : undefined;
    const phone = screen.getByLabelText("Teléfono (opcional)");
    expect(phone).not.toHaveAttribute("maxlength");
    await user.click(phone); await user.paste("+1 (202) 555-0123");
    expect(phone).toHaveValue("+1 (202) 555-0123");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body)).phone).toBe("+1 (202) 555-0123");
    expect(phone).toHaveValue("+12025550123");
  });

  it("no convierte un año corto en fecha ni impone una edad mínima", async () => {
    await ready(); await userEvent.type(screen.getByLabelText("Año de nacimiento (opcional)"), "9");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body)).birthYear).toBe(9);
  });

  it.each(["SESSION", "PERSISTENT"] as const)("el guardado conectado actualiza el nombre en sesión y storage %s sin cambiar tokens ni permisos", async (mode) => {
    const { client } = mount(undefined, true);
    await userEvent.click(screen.getByRole("button", { name: mode === "SESSION" ? "Entrar uno" : "Entrar persistente" }));
    await screen.findByDisplayValue("Ana");
    const storage = mode === "SESSION" ? sessionStorage : localStorage;
    const otherStorage = mode === "SESSION" ? localStorage : sessionStorage;
    const before = JSON.parse(storage.getItem(AUTH_SESSION_STORAGE_KEY)!);

    await changeName("Nombre conectado"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    expect(screen.getByLabelText("Nombre en sesión")).toHaveTextContent("Nombre conectado");
    expect(screen.getByLabelText("Token en sesión")).toHaveTextContent("token-one");
    expect(JSON.parse(storage.getItem(AUTH_SESSION_STORAGE_KEY)!)).toEqual({ ...before, user: { ...before.user, displayName: "Nombre conectado" } });
    expect(otherStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    expect(client.getQueryData<UserProfile>(userProfileKey("one"))).toEqual({ ...initial("one"), displayName: "Nombre conectado", updatedAt: "2026-09-30T12:00:00.001Z" });
  });

  it("reemplazar la sesión del mismo usuario descarta PATCH tardío antes de tocar caché, borrador, éxito o storage", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const { client } = mount(undefined, true);
    await userEvent.click(screen.getByRole("button", { name: "Entrar uno" })); await screen.findByDisplayValue("Ana");
    await changeName("Borrador de la sesión anterior"); await userEvent.type(screen.getByLabelText("Teléfono (opcional)"), "+12025550123"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("button", { name: "Guardando cambios." });
    const patch = requests.find((item) => item.method === "PATCH")!;
    const cached = client.getQueryData<UserProfile>(userProfileKey("one"));

    await userEvent.click(screen.getByRole("button", { name: "Reemplazar sesión uno" }));
    expect(screen.getByLabelText("Nombre en sesión")).toHaveTextContent("Nombre de la sesión nueva");
    expect(patch.init.signal?.aborted).toBe(false);
    const replacementStorage = localStorage.getItem(AUTH_SESSION_STORAGE_KEY);
    expect(replacementStorage).not.toBeNull();
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
    await act(async () => saving.resolve(json({ ...initial("one"), displayName: "Respuesta de la sesión anterior", updatedAt: "2026-09-30T12:00:00.001Z" })));

    await waitFor(() => expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeEnabled());
    expect(client.getQueryData<UserProfile>(userProfileKey("one"))).toEqual(cached);
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Borrador de la sesión anterior");
    expect(screen.getByLabelText("Teléfono (opcional)")).toHaveValue("+12025550123");
    expect(screen.queryByText("Los cambios de tu cuenta se guardaron.")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Nombre en sesión")).toHaveTextContent("Nombre de la sesión nueva");
    expect(screen.getByLabelText("Token en sesión")).toHaveTextContent("token-reemplazo");
    expect(localStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBe(replacementStorage);
    expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull();
  });

  it("un año fraccionario muestra validación accesible y no envía PATCH", async () => {
    await ready();
    const year = screen.getByLabelText("Año de nacimiento (opcional)");
    await userEvent.type(year, "1990.5");
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Ingresa un año entero.");
    expect(year).toHaveAttribute("aria-invalid", "true");
    expect(year).toHaveAttribute("aria-describedby", "personal-birth-year-help personal-birth-year-error");
    expect(requests.some((item) => item.method === "PATCH")).toBe(false);
  });

  it.each(["1e", "-"])("año inválido %s conserva el texto y no borra un año guardado", async (value) => {
    profiles.set("one", { ...initial("one"), birthYear: 1990 });
    await ready();
    const year = screen.getByLabelText("Año de nacimiento (opcional)");
    expect(year).toHaveAttribute("inputmode", "numeric");
    await userEvent.clear(year); await userEvent.type(year, value);
    expect(year).toHaveValue(value);
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await screen.findByText("Ingresa un año entero.");
    expect(requests.some((item) => item.method === "PATCH")).toBe(false);
    expect(profiles.get("one")?.birthYear).toBe(1990);
  });

  it("409 conserva el borrador y obliga a consultar antes de descartarlo y guardar con la versión nueva", async () => {
    await ready(); await changeName("Borrador local");
    await userEvent.type(screen.getByLabelText("Nombre de usuario (opcional)"), "alias-local");
    await userEvent.click(screen.getByRole("radio", { name: "Sol" }));
    profiles.set("one", { ...initial("one"), displayName: "Nombre remoto", birthYear: 1980, username: "alias-remoto", phone: "+12025550124", avatarId: "mountain", updatedAt: "2026-09-30T12:00:01.000Z" });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/Tu perfil cambió desde que empezaste/);
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Borrador local");
    expect(screen.getByLabelText("Nombre de usuario (opcional)")).toHaveValue("alias-local");
    expect(screen.getByRole("radio", { name: "Sol" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descartar cambios" })).toBeDisabled();
    expect(screen.queryByText("Los cambios de tu cuenta se guardaron.")).not.toBeInTheDocument();
    screen.getByRole("button", { name: "Consultar perfil actual" }).focus(); await userEvent.keyboard("{Enter}");
    await screen.findByText(/Perfil consultado/);
    const consulted = screen.getByRole("region", { name: "Perfil actual consultado" });
    expect(consulted).toHaveTextContent("Nombre remoto"); expect(consulted).toHaveTextContent("alias-remoto"); expect(consulted).toHaveTextContent("1980"); expect(consulted).toHaveTextContent("+12025550124"); expect(consulted).toHaveTextContent("Montaña");
    expect(screen.getByRole("form", { name: "Datos de tu cuenta" })).toHaveFocus();
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Borrador local");
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Nombre remoto");
    expect(screen.getByLabelText("Nombre de usuario (opcional)")).toHaveValue("alias-remoto");
    expect(screen.getByLabelText("Año de nacimiento (opcional)")).toHaveValue("1980");
    expect(screen.getByLabelText("Teléfono (opcional)")).toHaveValue("+12025550124");
    expect(screen.getByRole("radio", { name: "Montaña" })).toBeChecked();
    await changeName("Nombre final"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    const patches = requests.filter((item) => item.method === "PATCH");
    expect(JSON.parse(String(patches[0].init.body)).expectedUpdatedAt).toBe(initial("one").updatedAt);
    expect(JSON.parse(String(patches[1].init.body)).expectedUpdatedAt).toBe("2026-09-30T12:00:01.000Z");
    expect(profiles.get("one")?.displayName).toBe("Nombre final");
  });

  it("permite descartar un conflicto consultado aunque el borrador vuelva a los valores iniciales", async () => {
    await ready(); await changeName("Borrador local");
    profiles.set("one", { ...initial("one"), displayName: "Nombre remoto", updatedAt: "2026-09-30T12:00:01.000Z" });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/Tu perfil cambió desde que empezaste/);
    await userEvent.clear(screen.getByLabelText("Nombre completo"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), "Ana");
    expect(screen.getByRole("button", { name: "Descartar cambios" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Consultar perfil actual" }));
    await screen.findByText(/Perfil consultado/);
    expect(screen.getByRole("button", { name: "Guardar cambios" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Descartar cambios" })).toBeEnabled();
    await userEvent.click(screen.getByRole("button", { name: "Descartar cambios" }));
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Nombre remoto");
    await changeName("Nombre final"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
    const patches = requests.filter((item) => item.method === "PATCH");
    expect(patches).toHaveLength(2);
    expect(JSON.parse(String(patches[1].init.body)).expectedUpdatedAt).toBe("2026-09-30T12:00:01.000Z");
  });

  it("un refetch durante edición no sustituye la versión original del borrador", async () => {
    const { client } = await ready(); await changeName("Borrador local");
    profiles.set("one", { ...initial("one"), displayName: "Remoto", updatedAt: "2026-09-30T12:00:01.000Z" });
    await act(async () => { await client.refetchQueries({ queryKey: userProfileKey("one") }); });
    await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText(/Tu perfil cambió desde que empezaste/);
    expect(JSON.parse(String(requests.find((item) => item.method === "PATCH")!.init.body)).expectedUpdatedAt).toBe(initial("one").updatedAt);
    expect(profiles.get("one")?.displayName).toBe("Remoto");
  });

  it("nombre legacy nulo no inventa uno y valida el campo de forma accesible", async () => {
    profiles.set("one", { ...initial("one"), displayName: null });
    mount(); await userEvent.click(screen.getByRole("button", { name: "Entrar uno" }));
    const input = await screen.findByLabelText("Nombre completo"); expect(input).toHaveValue("");
    await userEvent.type(input, "   "); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Ingresa tu nombre.");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAttribute("aria-describedby", "personal-display-name-error");
    expect(requests.some((item) => item.method === "PATCH")).toBe(false);
  });

  it("conserva un único guardado pendiente y no roba foco tras la respuesta", async () => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    await ready(); await changeName("Ana nueva");
    const form = screen.getByRole("form", { name: "Datos de tu cuenta" });
    fireEvent.submit(form); fireEvent.submit(form);
    await screen.findByRole("button", { name: "Guardando cambios." });
    expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1);
    const other = screen.getByRole("button", { name: "Entrar dos" }); other.focus();
    await act(async () => saving.resolve(json({ ...initial("one"), displayName: "Ana nueva" })));
    await screen.findByText("Los cambios de tu cuenta se guardaron."); expect(other).toHaveFocus();
  });

  it.each([400, 500])("rechazo %s conserva el borrador y permite reintentar sin simular éxito", async (status) => {
    const view = await ready(); override = (_path, init) => init.method === "PATCH" ? json({ message: "No se pudo guardar" }, status) : undefined;
    await changeName("Borrador"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("alert"); expect(screen.getByLabelText("Nombre completo")).toHaveValue("Borrador");
    expect(view.onSaved).not.toHaveBeenCalled(); expect(screen.queryByText("Los cambios de tu cuenta se guardaron.")).not.toBeInTheDocument();
    override = () => undefined; await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron.");
  });

  it.each([403, 404])("PATCH %s retira datos y ofrece una reconsulta", async (status) => {
    await ready(); override = (_path, init) => init.method === "PATCH" ? json({ message: "Sin acceso" }, status) : undefined;
    await changeName("Cambio"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("button", { name: "Actualizar cuenta" }); expect(screen.queryByLabelText("Nombre completo")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Actualizar cuenta" }));
    await screen.findByDisplayValue("Cambio");
    expect(screen.getByRole("form", { name: "Datos de tu cuenta" })).toHaveFocus();
    expect(requests.filter((item) => item.method === "GET" && item.path.endsWith("/users/one/profile"))).toHaveLength(2);
  });

  it("refetch sincroniza campos limpios y conserva un borrador", async () => {
    const { client } = await ready(); profiles.set("one", { ...initial("one"), displayName: "Nombre remoto" });
    await act(async () => { await client.refetchQueries({ queryKey: userProfileKey("one") }); });
    await waitFor(() => expect(screen.getByLabelText("Nombre completo")).toHaveValue("Nombre remoto"));
    await userEvent.type(screen.getByLabelText("Nombre completo"), " borrador"); profiles.set("one", { ...initial("one"), displayName: "Otro nombre" });
    await act(async () => { await client.refetchQueries({ queryKey: userProfileKey("one") }); });
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Nombre remoto borrador");
  });

  it("un GET previo que llega tarde no reemplaza el nombre confirmado", async () => {
    const { client } = await ready(); const old = deferred<Response>();
    override = (path, init) => path.endsWith("/users/one/profile") && !init.method ? old.promise : undefined;
    let reading!: Promise<unknown>;
    act(() => { reading = client.refetchQueries({ queryKey: userProfileKey("one") }); });
    await waitFor(() => expect(requests.filter((item) => item.path.endsWith("/users/one/profile") && item.method === "GET")).toHaveLength(2));
    const get = requests.filter((item) => item.path.endsWith("/users/one/profile") && item.method === "GET").at(-1)!;
    await changeName("Nombre confirmado"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByText("Los cambios de tu cuenta se guardaron."); expect(get.init.signal?.aborted).toBe(true);
    await act(async () => { old.resolve(json(initial("one"))); await reading; });
    expect(screen.getByLabelText("Nombre completo")).toHaveValue("Nombre confirmado");
    expect(client.getQueryData<UserProfile>(userProfileKey("one"))?.displayName).toBe("Nombre confirmado");
  });

  it.each(["identity", "logout", "unmount"])("%s aborta PATCH y descarta su éxito tardío", async (exit) => {
    const saving = deferred<Response>(); override = (_path, init) => init.method === "PATCH" ? saving.promise : undefined;
    const view = await ready(); await changeName("Antiguo"); await userEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("button", { name: "Guardando cambios." }); const patch = requests.find((item) => item.method === "PATCH")!;
    if (exit === "identity") { await userEvent.click(screen.getByRole("button", { name: "Entrar dos" })); await screen.findByDisplayValue("Beatriz"); }
    else if (exit === "logout") { await userEvent.click(screen.getByRole("button", { name: "Salir" })); await waitFor(() => expect(screen.getByLabelText("Sesión")).toHaveTextContent("unauthenticated")); }
    else view.unmount();
    expect(patch.init.signal?.aborted).toBe(true);
    await act(async () => saving.resolve(json({ ...initial("one"), displayName: "Antiguo" })));
    expect(view.onSaved).not.toHaveBeenCalled(); expect(screen.queryByText("Los cambios de tu cuenta se guardaron.")).not.toBeInTheDocument();
    if (exit === "logout") { expect(view.client.getQueryCache().getAll().some((query) => query.queryKey[1] === "one")).toBe(false); expect(sessionStorage.getItem(AUTH_SESSION_STORAGE_KEY)).toBeNull(); }
  });

  it("cambio de identidad cancela lectura antigua y no mezcla perfiles", async () => {
    const old = deferred<Response>(); override = (path) => path.endsWith("/users/one/profile") ? old.promise : undefined;
    mount(); await userEvent.click(screen.getByRole("button", { name: "Entrar uno" })); await screen.findByText("Cargando tu perfil.");
    await userEvent.click(screen.getByRole("button", { name: "Entrar dos" })); await screen.findByDisplayValue("Beatriz");
    expect(requests.find((item) => item.path.endsWith("/users/one/profile"))?.init.signal?.aborted).toBe(true);
    await act(async () => old.resolve(json(initial("one"))));
    expect(screen.queryByDisplayValue("Ana")).not.toBeInTheDocument(); expect(screen.queryByText("one@example.test")).not.toBeInTheDocument();
  });

  it.each([403, 404, 500])("GET %s presenta error, reintento por teclado y carga real", async (status) => {
    const pending = deferred<Response>(); override = (path) => path.endsWith("/users/one/profile") ? pending.promise : undefined;
    mount(); await userEvent.click(screen.getByRole("button", { name: "Entrar uno" })); await screen.findByText("Cargando tu perfil.");
    await act(async () => pending.resolve(json({ message: "Error" }, status))); await screen.findByRole("alert");
    expect(screen.queryByLabelText("Nombre completo")).not.toBeInTheDocument(); override = () => undefined;
    const retry = screen.getByRole("button", { name: "Reintentar cuenta" }); retry.focus(); await userEvent.keyboard("{Enter}");
    await screen.findByDisplayValue("Ana"); expect(screen.getByRole("heading", { name: "Tu cuenta" })).toHaveFocus();
  });
});
