import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LoginResponse } from "../../auth/types/auth.types";
import { BookingOperationActions } from "../components/BookingOperationActions";
import type { Booking, BookingOperation, BookingStatus, BookingTimelineItem } from "../types/booking.types";
import { BookingDetailPage } from "./BookingDetailPage";

const context = vi.hoisted(() => ({ authStatus: "authenticated", businessStatus: "ready", role: "OWNER" as string | null, businessId: "business-1", activeId: "business-1", activeStatus: "ACTIVE", session: null as LoginResponse | null }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: context.authStatus, session: context.session }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ status: context.businessStatus, activeBusinessId: context.businessId, activeRole: context.role, activeBusiness: { id: context.activeId, status: context.activeStatus, timezone: "America/Asuncion", currency: "PYG" } }) }));
vi.mock("../../payments/components/BookingPayments", () => ({ BookingPayments: () => null }));

const originalVersion = "2026-09-30T12:00:00.000Z";
const newVersion = "2026-10-02T12:00:00.000Z";
type RequestRecord = { method: string; path: string; body: unknown; signal?: AbortSignal | null };
const clients: QueryClient[] = [];
const operations = [
  ["check-in", "Registrar ingreso", "CONFIRMED", "IN_PROGRESS", "BOOKING_CHECKED_IN", "Ingreso registrado"],
  ["check-out", "Registrar salida", "IN_PROGRESS", "COMPLETED", "BOOKING_CHECKED_OUT", "Salida registrada"],
  ["no-show", "No show", "CONFIRMED", "NO_SHOW", "BOOKING_MARKED_NO_SHOW", "No show registrado"],
] as const;

function makeBooking(status: BookingStatus): Booking {
  return { id: "booking-1", businessId: "business-1", status, contactId: "contact-1", resourceIds: ["resource-1"], checkInDate: "2026-09-24", checkOutDate: "2026-09-26", adults: 2, children: 0, notes: null, createdAt: originalVersion, updatedAt: originalVersion };
}
function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }); }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }

function setup(status: BookingStatus, options: { actionsOnly?: boolean; total?: number; balanceStatus?: number; deferBalance?: boolean; deferPost?: boolean; failure?: number; reloadFails?: boolean } = {}) {
  let current = makeBooking(status);
  let timeline: BookingTimelineItem[] = [];
  let postFailure = options.failure;
  let getCount = 0;
  const pending = deferred<Response>();
  const balancePending = deferred<Response>();
  const requests: RequestRecord[] = [];
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = new URL(input instanceof Request ? input.url : String(input), window.location.origin).pathname;
    const method = init.method ?? "GET";
    requests.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null, signal: init.signal });
    if (method === "GET" && path.endsWith("/outstanding-balance")) {
      if (options.deferBalance) return balancePending.promise;
      return Promise.resolve(json({ bookingId: current.id, totalAmountMinor: options.total ?? 0, paidAmountMinor: 0, outstandingAmountMinor: 0, currency: "PYG", financialStatus: "UNPAID" }, options.balanceStatus ?? 200));
    }
    if (method === "GET" && path.endsWith("/contacts")) return Promise.resolve(json([{ id: "contact-1", fullName: "Ana Fixture" }]));
    if (method === "GET" && path.endsWith("/resources")) return Promise.resolve(json([{ id: "resource-1", name: "Recurso Fixture", capacityMaximum: 4 }]));
    if (method === "GET" && path.endsWith("/timeline")) return Promise.resolve(json({ items: timeline, pageInfo: { hasNextPage: false, nextCursor: null } }));
    if (method === "GET" && path.endsWith(`/bookings/${current.id}`)) {
      getCount++;
      return Promise.resolve(options.reloadFails && getCount > 1 ? json({ message: "Servicio no disponible" }, 503) : json(current));
    }
    if (method === "POST") {
      if (options.deferPost) return pending.promise;
      if (postFailure) {
        const failure = postFailure; postFailure = undefined;
        if (failure === 409) current = { ...current, status: "IN_PROGRESS", updatedAt: newVersion };
        return Promise.resolve(json({ message: failure === 409 ? "La reserva cambió" : "No disponible" }, failure));
      }
      const operation = path.split("/").at(-1) as BookingOperation;
      const manual = operations.find(([name]) => name === operation);
      if (!manual && operation !== "confirm-without-payment") throw new Error(`POST no permitido: ${path}`);
      current = { ...current, status: manual?.[3] ?? "CONFIRMED", updatedAt: newVersion };
      timeline = [{ id: "event-1", type: manual?.[4] ?? "BOOKING_CONFIRMED", occurredAt: newVersion, actor: { userId: "user-1" }, details: { reason: (JSON.parse(String(init.body)) as { reason?: string }).reason, ...(operation === "confirm-without-payment" ? { source: "FREE_CONFIRM" } : {}) } }];
      return Promise.resolve(json(current));
    }
    throw new Error(`Solicitud inesperada: ${method} ${path}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } } }); clients.push(client);
  const view = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/bookings/booking-1"]}><Routes><Route path="/app/bookings/:bookingId" element={options.actionsOnly ? <BookingOperationActions businessId={current.businessId} booking={current} /> : <BookingDetailPage />} /></Routes></MemoryRouter></QueryClientProvider>;
  const page = render(view());
  return { client, requests, pending, balancePending, page, view, user: userEvent.setup(), setBooking: (booking: Booking) => { current = booking; } };
}

beforeEach(() => {
  context.authStatus = "authenticated"; context.businessStatus = "ready"; context.role = "OWNER";
  context.businessId = "business-1"; context.activeId = "business-1"; context.activeStatus = "ACTIVE";
  context.session = { accessToken: "fixture-token", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 3600, user: { id: "user-1", email: "user@example.test", status: "ACTIVE" }, memberships: [{ businessId: "business-1", role: "OWNER" }] };
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe.each(["OWNER", "ADMIN", "RECEPTIONIST"])("Operaciones manuales para %s", (role) => {
  it.each(operations)("%s persiste una sola acción con versión y actualiza detalle e historial", async (operation, label, before, after, _event, timelineLabel) => {
    context.role = role;
    const { user, requests } = setup(before);
    await user.click(await screen.findByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog", { name: label });
    await user.type(within(dialog).getByRole("textbox", { name: "Motivo (opcional)" }), "  Registro manual  ");
    await user.dblClick(within(dialog).getByRole("button", { name: label }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(after === "IN_PROGRESS" ? "En curso" : after === "COMPLETED" ? "Finalizada" : "No show", { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(await screen.findByText(timelineLabel)).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toEqual([expect.objectContaining({ path: `/api/businesses/business-1/bookings/booking-1/${operation}`, body: { expectedUpdatedAt: originalVersion, reason: "Registro manual" } })]);
  });
  it("confirma un PENDING de total cero sin crear un pago", async () => {
    context.role = role;
    const { user, requests } = setup("PENDING", { total: 0 });
    await user.click(await screen.findByRole("button", { name: "Confirmar sin cobro" }));
    const dialog = screen.getByRole("dialog", { name: "Confirmar sin cobro" });
    expect(dialog).toHaveTextContent("sin registrar un pago");
    await user.click(within(dialog).getByRole("button", { name: "Confirmar sin cobro" }));
    expect(await screen.findByText("Reserva confirmada sin cobro", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText("Confirmada", { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(requests.filter((request) => request.method === "POST")).toEqual([expect.objectContaining({ path: "/api/businesses/business-1/bookings/booking-1/confirm-without-payment", body: { expectedUpdatedAt: originalVersion } })]);
    expect(requests.some((request) => request.path.endsWith("/payments"))).toBe(false);
  });
});

it.each([
  ["VIEWER", () => { context.role = "VIEWER"; }], ["rol ausente", () => { context.role = null; }],
  ["sesiόn ausente", () => { context.session = null; }], ["token vacío", () => { context.session!.accessToken = ""; }],
  ["restaurando", () => { context.authStatus = "restoring"; }], ["no autenticado", () => { context.authStatus = "unauthenticated"; }],
  ["negocio cargando", () => { context.businessStatus = "loading"; }], ["negocio incoherente", () => { context.activeId = "business-2"; }],
  ["otro tenant", () => { context.businessId = "business-2"; }], ["suspendido", () => { context.activeStatus = "SUSPENDED"; }],
  ["archivado", () => { context.activeStatus = "ARCHIVED"; }],
] as const)("%s no obtiene elegibilidad gratuita ni ofrece acciones", async (_label, change) => {
  change(); const { requests } = setup("PENDING", { actionsOnly: true });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  await act(async () => { await Promise.resolve(); }); expect(requests).toEqual([]);
});

it.each(["DRAFT", "COMPLETED", "CANCELLED", "NO_SHOW"] as const)("%s no ofrece nuevas acciones ni consulta el total", async (status) => {
  const { requests } = setup(status, { actionsOnly: true });
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  await act(async () => { await Promise.resolve(); }); expect(requests).toEqual([]);
});

it.each([1, -1, 500000])("total %s no habilita confirmación gratuita aunque el saldo pendiente sea cero", async (total) => {
  const { requests } = setup("PENDING", { actionsOnly: true, total });
  await waitFor(() => expect(screen.queryByText(/Consultando el total/)).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Confirmar sin cobro" })).not.toBeInTheDocument();
  expect(requests.filter((request) => request.method === "POST")).toEqual([]);
});

it("mantiene la acción gratuita ausente mientras carga el total y ante error", async () => {
  const { page, view, balancePending } = setup("PENDING", { actionsOnly: true, deferBalance: true });
  expect(screen.getByRole("status")).toHaveTextContent("Consultando el total");
  expect(screen.queryByRole("button", { name: "Confirmar sin cobro" })).not.toBeInTheDocument();
  await act(async () => { balancePending.resolve(json({ message: "No disponible" }, 503)); await balancePending.promise; });
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos consultar el total");
  expect(screen.getByRole("button", { name: "Reintentar total" })).toBeEnabled();
  page.rerender(view()); expect(screen.queryByRole("button", { name: "Confirmar sin cobro" })).not.toBeInTheDocument();
});

it("un PENDING histórico sin snapshot no inventa elegibilidad gratuita", async () => {
  const { requests } = setup("PENDING", { actionsOnly: true, balanceStatus: 409 });
  await waitFor(() => expect(screen.queryByText(/Consultando el total/)).not.toBeInTheDocument());
  expect(screen.queryByRole("button", { name: "Confirmar sin cobro" })).not.toBeInTheDocument();
  expect(requests.filter((request) => request.method === "POST")).toEqual([]);
});

it("valida motivo, permite cancelación con Escape y devuelve el foco", async () => {
  const { user, requests } = setup("CONFIRMED");
  const trigger = await screen.findByRole("button", { name: "Registrar ingreso" });
  await user.click(trigger);
  const dialog = screen.getByRole("dialog"); const reason = within(dialog).getByRole("textbox", { name: "Motivo (opcional)" });
  await user.type(reason, "x"); await user.click(within(dialog).getByRole("button", { name: "Registrar ingreso" }));
  expect(reason).toHaveAttribute("aria-invalid", "true"); expect(dialog).toHaveTextContent("entre 2 y 500");
  await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(trigger).toHaveFocus();
  expect(requests.filter((request) => request.method === "POST")).toEqual([]);
  await user.click(trigger); expect(within(screen.getByRole("dialog")).getByRole("textbox")).toHaveValue("");
});

it("409 recarga mediante GET y exige elegir otra vez sin reenviar el POST", async () => {
  const { user, requests } = setup("CONFIRMED", { failure: 409 });
  await user.click(await screen.findByRole("button", { name: "Registrar ingreso" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(screen.getByText("En curso", { selector: ".booking-detail-status" })).toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent("vuelve a elegir la acción");
  expect(requests.filter((request) => request.method === "GET" && request.path.endsWith("/bookings/booking-1"))).toHaveLength(2);
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Registrar salida" })).toBeEnabled();
});

it("si falla la reconciliación bloquea la confirmación y conserva la recarga", async () => {
  const { user, requests } = setup("CONFIRMED", { failure: 409, reloadFails: true });
  await user.click(await screen.findByRole("button", { name: "Registrar ingreso" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos actualizar");
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" })).toBeDisabled();
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Recargar reserva" })).toBeEnabled();
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
});

it("un error de servidor conserva el motivo sin modificar el estado", async () => {
  const { user, requests } = setup("CONFIRMED", { failure: 503 });
  await user.click(await screen.findByRole("button", { name: "No show" }));
  const dialog = screen.getByRole("dialog"); await user.type(within(dialog).getByRole("textbox"), "No se presentó");
  await user.click(within(dialog).getByRole("button", { name: "No show" }));
  await screen.findByRole("alert"); expect(within(dialog).getByRole("textbox")).toHaveValue("No se presentó");
  expect(screen.getByText("Confirmada", { selector: ".booking-detail-status" })).toBeInTheDocument();
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
});

it("una versión nueva durante el diálogo impide enviar la versión antigua", async () => {
  const { user, page, view, setBooking, requests } = setup("CONFIRMED", { actionsOnly: true });
  await user.click(screen.getByRole("button", { name: "Registrar ingreso" }));
  setBooking({ ...makeBooking("CONFIRMED"), updatedAt: newVersion }); page.rerender(view());
  expect(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" })).toBeDisabled();
  expect(screen.getByRole("alert")).toHaveTextContent("cambió mientras revisabas");
  expect(requests).toEqual([]);
});

it.each(["rol", "identidad", "tenant", "reserva", "sesión", "ACTIVE"])("aborta la petición al cambiar %s y descarta la respuesta tardía", async (change) => {
  const { user, page, view, requests, pending, client, setBooking } = setup("CONFIRMED", { actionsOnly: true, deferPost: true });
  await user.click(screen.getByRole("button", { name: "Registrar ingreso" }));
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" }));
  await waitFor(() => expect(requests.filter((request) => request.method === "POST")).toHaveLength(1));
  const request = requests[0]; const invalidate = vi.spyOn(client, "invalidateQueries");
  if (change === "rol") context.role = "ADMIN";
  if (change === "identidad") context.session = { ...context.session!, user: { ...context.session!.user, id: "user-2" } };
  if (change === "tenant") { context.businessId = "business-2"; context.activeId = "business-2"; setBooking({ ...makeBooking("CONFIRMED"), businessId: "business-2" }); }
  if (change === "reserva") setBooking({ ...makeBooking("CONFIRMED"), id: "booking-2" });
  if (change === "sesión") context.session = null;
  if (change === "ACTIVE") context.activeStatus = "SUSPENDED";
  page.rerender(view()); expect(request.signal?.aborted).toBe(true); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await act(async () => { pending.resolve(json({ ...makeBooking("IN_PROGRESS"), updatedAt: newVersion })); await pending.promise; });
  expect(invalidate).not.toHaveBeenCalled(); expect(client.getQueryData(["bookings", "business-1", "booking-1"])).toBeUndefined();
  expect(screen.queryByText("Acción registrada. El estado de la reserva se actualizó.")).not.toBeInTheDocument();
  expect(requests.filter((item) => item.method === "POST")).toHaveLength(1);
});

it("durante loading bloquea dobles envíos y Escape hasta resolver", async () => {
  const { user, requests, pending } = setup("CONFIRMED", { actionsOnly: true, deferPost: true });
  await user.click(screen.getByRole("button", { name: "Registrar ingreso" }));
  const dialog = screen.getByRole("dialog"); await user.dblClick(within(dialog).getByRole("button", { name: "Registrar ingreso" }));
  expect(within(dialog).getByRole("button", { name: "Procesando…" })).toBeDisabled(); expect(within(dialog).getByRole("button", { name: "Cancelar" })).toBeDisabled();
  await user.keyboard("{Escape}"); expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
  await act(async () => { pending.resolve(json({ ...makeBooking("IN_PROGRESS"), updatedAt: newVersion })); await pending.promise; });
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
});

it("reconcilia sólo las listas, disponibilidad, dashboard y saldo del negocio correspondiente", async () => {
  const { user, client } = setup("CONFIRMED", { actionsOnly: true });
  const ownKeys = [["bookings", "business-1", "", "", ""], ["booking-timeline", "business-1", "booking-1"], ["availability", "calendar", "business-1"], ["availability", "check", "business-1"], ["dashboard", "business-1"], ["outstanding-balance", "user-1", "business-1", "booking-1"]];
  const foreign = ["bookings", "business-2", "", "", ""];
  ownKeys.forEach((key) => client.setQueryData(key, [])); client.setQueryData(foreign, []);
  await user.click(screen.getByRole("button", { name: "Registrar ingreso" })); await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar ingreso" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  expect(client.getQueryData<Booking>(["bookings", "business-1", "booking-1"])?.status).toBe("IN_PROGRESS");
  ownKeys.forEach((key) => expect(client.getQueryState(key)?.isInvalidated).toBe(true)); expect(client.getQueryState(foreign)?.isInvalidated).toBe(false);
});
