import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GlobalSearch } from "./GlobalSearch";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import type { SearchResponse, SearchType } from "../types";

const context = vi.hoisted(() => ({ userId: "user-1", businessId: "business-1", auth: "authenticated", business: "ready" }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: context.auth, session: { user: { id: context.userId }, accessToken: "synthetic-token" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ status: context.business, activeBusinessId: context.businessId }) }));
const fetchMock = vi.fn<typeof fetch>();
const navigate = vi.fn(), moduleNavigate = vi.fn();
const data = (title = "Resultado", type: SearchType = "resource", hasMore = false): SearchResponse => ({ groups: [{ type, hasMore, items: [{ type, id: "id-1", title, subtitle: "Contexto", status: "ACTIVE" }] }] });
const response = (value = data(), status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
function mount() {
  const client = new QueryClient();
  let heading = "Destino";
  const ui = () => <QueryClientProvider client={client}><GlobalSearch onModuleNavigate={moduleNavigate} onEntityNavigate={navigate} /><main className="top-app-shell__content"><h1 key={heading}>{heading}</h1></main><button>Después</button></QueryClientProvider>;
  const view = render(ui());
  const input = screen.getByRole("combobox");
  return { input, client, refresh: () => view.rerender(ui()), replaceHeading: () => { heading = "Detalle cargado"; view.rerender(ui()); } };
}
const advance = async (ms = 300) => {
  if (!vi.isFakeTimers()) {
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, ms)); });
    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 0)); });
    return;
  }
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // La actualización del debounce monta la query al cerrar el primer act.
  // Procesar su notificación sin adelantar el reloj de la prueba.
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
};
function type(input: HTMLElement, value: string) { fireEvent.change(input, { target: { value } }); }
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset().mockImplementation(() => Promise.resolve(response()));
  navigate.mockReset(); moduleNavigate.mockReset(); Object.assign(context, { userId: "user-1", businessId: "business-1", auth: "authenticated", business: "ready" });
});
afterEach(() => { cleanup(); configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); vi.useRealTimers(); });

it("muestra orientación sin HTTP y módulos inmediatos antes del debounce", async () => {
  const { input } = mount();
  act(() => input.focus());
  expect(screen.getByRole("status")).toHaveTextContent("UUID completo");
  await advance(); expect(fetchMock).not.toHaveBeenCalled();
  type(input, "Re"); expect(screen.getByRole("option", { name: "Recursos" })).toBeInTheDocument();
  await advance(249); expect(fetchMock).not.toHaveBeenCalled();
  await advance(10); expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toContain("/businesses/business-1/search?q=Re");
  expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
});
it.each(["a", "a".repeat(121), "   "])("no consulta fuera del umbral: %s", async (query) => {
  const { input } = mount(); type(input, query); await advance(); expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["restoring", "unauthenticated"])("no consulta durante %s", async (auth) => {
  context.auth = auth; const { input } = mount(); type(input, "re"); await advance(); expect(fetchMock).not.toHaveBeenCalled();
});
it.each(["empty", "selection-required", "loading", "error"])("no consulta Business %s", async (business) => {
  context.business = business; const { input } = mount(); type(input, "re"); await advance(); expect(fetchMock).not.toHaveBeenCalled();
});
it("cancela, oculta resultados durante debounce e ignora respuestas fuera de orden", async () => {
  const old = deferred<Response>(); fetchMock.mockReturnValueOnce(old.promise);
  const { input } = mount(); type(input, "antiguo"); await advance();
  const signal = fetchMock.mock.calls[0][1]?.signal;
  type(input, "nuevo"); expect(screen.queryByRole("option", { name: /Resultado/ })).not.toBeInTheDocument();
  expect(signal?.aborted).toBe(true);
  await advance(); expect(screen.getByRole("option", { name: /Resultado/ })).toBeInTheDocument();
  await act(async () => old.resolve(response(data("Obsoleto")))); await advance(10);
  expect(screen.queryByText("Obsoleto")).not.toBeInTheDocument();
  type(input, "tercero"); expect(screen.queryByText("Resultado")).not.toBeInTheDocument();
});
it.each(["businessId", "userId", "auth"] as const)("limpia y cancela al cambiar %s", async (field) => {
  const old = deferred<Response>(); fetchMock.mockReturnValueOnce(old.promise);
  const { input, refresh } = mount(); type(input, "consulta"); await advance();
  const signal = fetchMock.mock.calls[0][1]?.signal;
  context[field] = field === "auth" ? "unauthenticated" : "otro"; refresh();
  expect(input).toHaveValue(""); expect(input).toHaveAttribute("aria-expanded", "false"); expect(signal?.aborted).toBe(true);
  await act(async () => old.resolve(response(data("Usuario anterior")))); await advance();
  expect(screen.queryByRole("option")).not.toBeInTheDocument(); expect(navigate).not.toHaveBeenCalled();
});
it("cierra con Escape conservando foco y sin cancelar queries ajenas", async () => {
  const old = deferred<Response>(); fetchMock.mockReturnValueOnce(old.promise);
  const { input, client } = mount(); client.setQueryData(["otra-feature"], "conservado");
  act(() => input.focus()); type(input, "consulta"); await advance();
  fireEvent.keyDown(input, { key: "Escape" });
  expect(input).toHaveFocus(); expect(input).toHaveValue(""); expect(fetchMock.mock.calls[0][1]?.signal?.aborted).toBe(true);
  expect(client.getQueryData(["otra-feature"])).toBe("conservado");
  await act(async () => old.resolve(response())); await advance(); expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
});
it("no cancela el refresh compartido y no reenvía Search cerrado después del 401", async () => {
  const refresh = deferred<string | null>(); const recover = vi.fn(() => refresh.promise); configureUnauthorizedRecovery({ recover });
  fetchMock.mockImplementationOnce(() => Promise.resolve(response(data(), 401)));
  const { input } = mount(); type(input, "consulta"); await advance(); expect(recover).toHaveBeenCalledOnce();
  fireEvent.keyDown(input, { key: "Escape" });
  await act(async () => refresh.resolve("synthetic-new-token")); await advance();
  expect(fetchMock).toHaveBeenCalledOnce(); expect(screen.queryByRole("option")).not.toBeInTheDocument();
});
it("presenta error local sin retries automáticos y preserva módulos", async () => {
  fetchMock.mockImplementation(() => Promise.resolve(response(data(), 500)));
  const { input } = mount(); type(input, "Re"); await advance(1000);
  expect(screen.getByRole("option", { name: "Recursos" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("No pudimos buscar entidades");
  expect(fetchMock).toHaveBeenCalledOnce();
  fetchMock.mockImplementation(() => Promise.resolve(response()));
  const retry = screen.getByRole("button", { name: "Reintentar búsqueda" });
  act(() => retry.focus()); expect(retry).toHaveFocus();
  vi.useRealTimers();
  await userEvent.setup().keyboard("{Enter}"); await advance();
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(screen.getByText("Resultado")).toBeInTheDocument();
});
it.each(["resource", "contact", "booking"] as const)("abre el detalle %s, limpia y enfoca contenido", async (kind) => {
  fetchMock.mockImplementation(() => Promise.resolve(response(data("Hallazgo", kind))));
  const { input } = mount(); type(input, "consulta"); await advance();
  fireEvent.click(screen.getByRole("option", { name: /Hallazgo/ })); await advance(20);
  expect(navigate).toHaveBeenCalledWith(`/app/${{ resource: "resources", contact: "contacts", booking: "bookings" }[kind]}/id-1`);
  expect(input).toHaveValue(""); expect(screen.getByRole("main")).toHaveFocus();
});
it("mantiene selección por id al llegar resultados y permite flechas/Enter", async () => {
  const old = deferred<Response>(); fetchMock.mockReturnValueOnce(old.promise);
  const { input } = mount(); type(input, "Re"); fireEvent.keyDown(input, { key: "ArrowDown" });
  const active = input.getAttribute("aria-activedescendant"); await advance();
  await act(async () => old.resolve(response())); await advance(10);
  expect(input).toHaveAttribute("aria-activedescendant", active);
  fireEvent.keyDown(input, { key: "Enter" }); expect(moduleNavigate).toHaveBeenCalledWith("bookings");
});
it("expone vacío y truncamiento por grupo sin prometer filtros", async () => {
  fetchMock.mockImplementationOnce(() => Promise.resolve(response({ groups: [{ type: "contact", items: [], hasMore: false }] })));
  const { input } = mount(); type(input, "consulta"); await advance(); expect(screen.getByText("Sin resultados en contactos.")).toBeInTheDocument();
  fetchMock.mockImplementation(() => Promise.resolve(response(data("Encontrado", "resource", true)))); type(input, "otra consulta"); await advance();
  fireEvent.click(screen.getByRole("option", { name: /Abrir módulo: Recursos/ })); expect(moduleNavigate).toHaveBeenCalledWith("resources");
});
it("Tab no se atrapa; el blur y el clic exterior cierran", async () => {
  const { input } = mount(); act(() => input.focus()); type(input, "Re");
  const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true }); input.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(false);
  act(() => screen.getByRole("button", { name: "Después" }).focus());
  expect(input).toHaveAttribute("aria-expanded", "false");
  act(() => input.focus()); fireEvent.pointerDown(document.body); expect(input).toHaveAttribute("aria-expanded", "false");
  await advance(); expect(fetchMock).not.toHaveBeenCalled();
});

async function focusedRetry() {
  // user-event recorre el foco nativo; el estado remoto se controla con promesas diferidas.
  // El reloj simulado queda reservado a las pruebas de debounce.
  vi.useRealTimers();
  const user = userEvent.setup();
  fetchMock.mockResolvedValueOnce(response(data(), 500));
  const view = mount();
  act(() => view.input.focus()); type(view.input, "consulta"); await advance();
  const button = await screen.findByRole("button", { name: "Reintentar búsqueda" });
  await user.tab();
  expect(button).toHaveFocus();
  return { ...view, user, button };
}

it.each([200, 500])("recupera foco antes del reintento pendiente y conserva consulta al terminar %s", async (status) => {
  const { input, user } = await focusedRetry();
  const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
  await user.keyboard("{Enter}"); await advance(10);
  expect(input).toHaveFocus(); expect(input).toHaveValue("consulta");
  expect(input).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("status")).toHaveTextContent("Buscando entidades");
  expect(screen.queryByRole("button", { name: "Reintentar búsqueda" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  await act(async () => pending.resolve(response(data(), status))); await advance();
  expect(input).toHaveFocus(); expect(input).toHaveValue("consulta");
  expect(fetchMock).toHaveBeenCalledTimes(2);
  if (status === 200) {
    await user.keyboard("{ArrowDown}{Enter}");
    expect(navigate).toHaveBeenCalledWith("/app/resources/id-1");
    await advance(30);
    expect(screen.getByRole("main")).toHaveFocus();
  } else {
    expect(screen.getByRole("button", { name: "Reintentar búsqueda" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("No pudimos buscar entidades");
  }
});

it("Escape desde reintentar devuelve foco sin reabrir ni consultar", async () => {
  const { input, user } = await focusedRetry();
  await user.keyboard("{Escape}"); await advance();
  expect(input).toHaveFocus(); expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("Tab y Shift+Tab recorren input, reintento y control exterior normalmente", async () => {
  const { input, user, button } = await focusedRetry();
  await user.tab({ shift: true }); expect(input).toHaveFocus();
  await user.tab(); expect(button).toHaveFocus();
  await user.tab(); expect(screen.getByRole("button", { name: "Después" })).toHaveFocus();
  expect(input).toHaveAttribute("aria-expanded", "false");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it.each(["cerrar", "contexto", "salir"])("no roba foco ni repone resultados tardíos tras %s durante reintento", async (action) => {
  const { input, user, refresh } = await focusedRetry();
  const pending = deferred<Response>(); fetchMock.mockReturnValueOnce(pending.promise);
  await user.keyboard("{Enter}"); await advance(10);
  expect(input).toHaveFocus(); expect(fetchMock).toHaveBeenCalledTimes(2);
  const signal = fetchMock.mock.calls[1][1]?.signal;
  if (action === "cerrar") await user.keyboard("{Escape}");
  if (action === "contexto") { context.businessId = "otro"; refresh(); }
  await user.tab();
  const outside = screen.getByRole("button", { name: "Después" });
  expect(outside).toHaveFocus(); expect(signal?.aborted).toBe(true);
  await act(async () => pending.resolve(response(data("Tardío")))); await advance(1000);
  expect(outside).toHaveFocus(); expect(input).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByText("Tardío")).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2); expect(navigate).not.toHaveBeenCalled();
});

it("conserva foco en el shell cuando el detalle sustituye su título de carga", async () => {
  const { input, replaceHeading } = mount(); type(input, "consulta"); await advance();
  fireEvent.click(screen.getByRole("option", { name: /Resultado/ })); await advance(20);
  expect(screen.getByRole("main")).toHaveFocus();
  replaceHeading();
  expect(screen.queryByRole("heading", { name: "Destino" })).not.toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Detalle cargado" })).toBeInTheDocument();
  expect(screen.getByRole("main")).toHaveFocus();
});
