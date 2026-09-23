import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubscriptionCard } from "./SubscriptionCard";
import { CreateResourcePage } from "../../resources/pages/CreateResourcePage";
import type { Subscription } from "../api/subscription";
import { requestUrl } from "../../../../tests/request-url";

const context = vi.hoisted(() => ({ businessId: "business-a", userId: "user-a", role: "OWNER" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: context.businessId, activeRole: context.role }) }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { accessToken: `token-${context.userId}`, user: { id: context.userId } } }) }));
const snapshot = (state: Subscription["usage"]["resources"]["state"] = "NORMAL"): Subscription => ({ subscription: { planCode: "TOP_INITIAL", planName: "TOP Inicial" }, entitlements: { maxResources: 10 }, usage: { resources: { used: state === "LIMIT" ? 10 : state === "WARNING" ? 8 : 2, available: state === "LIMIT" ? 0 : state === "WARNING" ? 2 : 8, percentage: state === "LIMIT" ? 100 : state === "WARNING" ? 80 : 20, state, canCreate: state !== "LIMIT" } }, upgrade: { status: "AVAILABLE", requestedAt: null } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const clients: QueryClient[] = [];
let calls: { path: string; init: RequestInit }[];
let respond: (path: string, init: RequestInit) => Response | Promise<Response>;
function mount(create = false) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(client);
  const tree = () => <QueryClientProvider client={client}><button>Otro control</button>{create ? <MemoryRouter initialEntries={["/app/resources/new"]}><Routes><Route path="/app/resources/new" element={<CreateResourcePage />} /><Route path="/app/resources/:id" element={<h1>Recurso creado</h1>} /></Routes></MemoryRouter> : <SubscriptionCard />}</QueryClientProvider>;
  const view = render(tree()); return { client, ...view, update: () => view.rerender(tree()) };
}
beforeEach(() => {
  Object.assign(context, { businessId: "business-a", userId: "user-a", role: "OWNER" }); calls = []; respond = () => json(snapshot());
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => { const path = requestUrl(input instanceof Request ? input.url : input).pathname; calls.push({ path, init }); return Promise.resolve(respond(path, init)); }));
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("Subscription integrada con QueryClient y transporte", () => {
  it.each(["NORMAL", "WARNING", "LIMIT"] as const)("representa estado contractual %s y capacidad sin recalcular reglas", async (state) => {
    respond = () => json(snapshot(state)); mount(); await screen.findByRole("heading", { name: "TOP Inicial" });
    expect(screen.getByRole("progressbar", { name: "Uso de recursos" })).toHaveAttribute("value", String(snapshot(state).usage.resources.percentage));
    if (state === "LIMIT") expect(screen.getByText(/Límite alcanzado/)).toBeInTheDocument();
    if (state === "WARNING") expect(screen.getByText(/Te estás acercando/)).toBeInTheDocument();
  });
  it("teclado registra una solicitud, mantiene foco pendiente y confirma sin otro POST", async () => {
    const pending = deferred<Response>(); respond = (path) => path.endsWith("upgrade-request") ? pending.promise : json(snapshot()); mount();
    const button = await screen.findByRole("button", { name: "Solicitar ampliación" }); button.focus(); await userEvent.keyboard("{Enter}{Enter}");
    await waitFor(() => expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1));
    expect(screen.getByRole("heading", { name: "TOP Inicial" })).toHaveFocus(); expect(screen.getByRole("button", { name: "Registrando solicitud…" })).toBeDisabled();
    await act(async () => pending.resolve(json({ status: "REQUESTED", requestedAt: "2026-09-23T00:00:00Z" })));
    await screen.findByText(/Solicitud de ampliación registrada/); expect(screen.queryByRole("button", { name: "Solicitar ampliación" })).not.toBeInTheDocument(); expect(screen.getByRole("heading", { name: "TOP Inicial" })).toHaveFocus();
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1);
  });
  it("resultado incierto permite reintentar la misma solicitud única sin robar foco", async () => {
    const pending = deferred<Response>(); let count = 0;
    respond = (path) => !path.endsWith("upgrade-request") ? json(snapshot()) : ++count === 1 ? json({ message: "fail" }, 500) : pending.promise;
    mount(); await userEvent.click(await screen.findByRole("button", { name: "Solicitar ampliación" })); await screen.findByRole("alert");
    await userEvent.click(screen.getByRole("button", { name: "Solicitar ampliación" })); await userEvent.click(screen.getByRole("button", { name: "Otro control" }));
    await act(async () => pending.resolve(json({ status: "REQUESTED", requestedAt: "2026-09-23T00:00:00Z" })));
    await screen.findByText(/Solicitud de ampliación registrada/); expect(screen.getByRole("button", { name: "Otro control" })).toHaveFocus(); expect(count).toBe(2);
    const posts = calls.filter((call) => call.init.method === "POST"); expect(posts[0].path).toBe(posts[1].path); expect(posts.every((call) => call.init.body === undefined)).toBe(true);
  });
  it.each([403, 404, 500])("GET %s no habilita alta de Resources y permite reintentar", async (status) => {
    respond = () => json({ message: "fail" }, status); mount(true); await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Crear recurso" })).toBeDisabled();
    respond = () => json(snapshot()); await userEvent.click(screen.getByRole("button", { name: "Reintentar plan" })); await screen.findByRole("heading", { name: "TOP Inicial" });
    expect(screen.getByRole("button", { name: "Crear recurso" })).toBeEnabled();
  });
  it.each(["VIEWER", "RECEPTIONIST"])("%s consulta pero no pide ampliación ni crea", async (role) => {
    context.role = role; mount(true); await screen.findByRole("heading", { name: "TOP Inicial" }); expect(screen.queryByRole("button", { name: "Solicitar ampliación" })).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Crear recurso" })).toBeDisabled();
  });
  it("ADMIN puede crear dentro del cupo pero no gestionar Subscription", async () => {
    context.role = "ADMIN"; mount(true); await screen.findByRole("heading", { name: "TOP Inicial" });
    expect(screen.queryByRole("button", { name: "Solicitar ampliación" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Crear recurso" })).toBeEnabled();
  });
  it.each(["businessId", "userId"] as const)("%s cancela lectura antigua sin mostrar datos de A en B", async (field) => {
    const old = deferred<Response>(); respond = () => old.promise; const view = mount();
    await waitFor(() => expect(calls).toHaveLength(1)); const signal = calls[0].init.signal;
    context[field] = "context-b"; respond = () => json({ ...snapshot(), subscription: { planCode: "B", planName: "Plan B" } }); view.update();
    await screen.findByRole("heading", { name: "Plan B" }); expect(signal?.aborted).toBe(true);
    await act(async () => old.resolve(json({ ...snapshot(), subscription: { planCode: "A", planName: "Plan antiguo" } })));
    expect(screen.queryByRole("heading", { name: "Plan antiguo" })).not.toBeInTheDocument();
  });
  it("límite impide alta y no confunde ampliar con un cobro", async () => {
    respond = () => json(snapshot("LIMIT")); mount(true); await screen.findByText(/Límite alcanzado/); expect(screen.getByRole("button", { name: "Crear recurso" })).toBeDisabled(); expect(calls.some((call) => call.init.method === "POST")).toBe(false);
  });
  it.each([403, 404])("POST %s retira la acción al perder acceso", async (status) => {
    respond = (path) => path.endsWith("upgrade-request") ? json({}, status) : json(snapshot()); mount();
    await userEvent.click(await screen.findByRole("button", { name: "Solicitar ampliación" }));
    await screen.findByText(/Ya no tenés acceso para solicitar/);
    expect(screen.queryByRole("button", { name: "Solicitar ampliación" })).not.toBeInTheDocument();
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1);
  });
  it.each(["businessId", "userId", "unmount"] as const)("POST pendiente y %s: aborta y descarta confirmación tardía", async (change) => {
    const pending = deferred<Response>(); respond = (path) => path.endsWith("upgrade-request") ? pending.promise : json(snapshot());
    const view = mount(); await userEvent.click(await screen.findByRole("button", { name: "Solicitar ampliación" }));
    const post = calls.find((call) => call.init.method === "POST")!;
    if (change === "unmount") view.unmount(); else { context[change] = "context-b"; view.update(); await screen.findByRole("button", { name: "Solicitar ampliación" }); }
    expect(post.init.signal?.aborted).toBe(true);
    await act(async () => pending.resolve(json({ status: "REQUESTED", requestedAt: "2026-09-23T00:00:00Z" })));
    expect(screen.queryByText(/Solicitud de ampliación registrada/)).not.toBeInTheDocument();
    if (change !== "unmount") expect(screen.getByRole("button", { name: "Solicitar ampliación" })).toBeEnabled();
  });
  it("alta 201 invalida cupo y navega una vez; fallo del GET posterior no repite POST", async () => {
    let created = false; respond = (path, init) => init.method === "POST" && path.endsWith("/resources") ? (created = true, json({ id: "resource-new" }, 201)) : created ? json({}, 500) : json(snapshot());
    mount(true); await screen.findByRole("heading", { name: "TOP Inicial" }); await userEvent.type(screen.getByRole("textbox", { name: "Nombre" }), "Cabaña nueva");
    await userEvent.dblClick(screen.getByRole("button", { name: "Crear recurso" })); await screen.findByRole("heading", { name: "Recurso creado" }); expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1);
  });
});
