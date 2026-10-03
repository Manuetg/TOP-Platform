import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "../../../../tests/request-url";
import type { LoginResponse } from "../../auth/types/auth.types";
import type { Booking } from "../types/booking.types";
import { EditBookingPage } from "./EditBookingPage";
import { ConfirmBookingPage } from "./ConfirmBookingPage";

const context = vi.hoisted(() => ({
  authStatus: "authenticated", businessStatus: "ready", role: "OWNER" as string | null,
  businessId: "business-1", activeBusinessId: "business-1", session: null as LoginResponse | null,
}));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: context.authStatus, session: context.session }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({
  status: context.businessStatus, activeBusinessId: context.businessId, activeRole: context.role,
  activeBusiness: { id: context.activeBusinessId, status: "ACTIVE", currency: "PYG" },
}) }));

type RequestRecord = { method: string; path: string; body: unknown; signal?: AbortSignal | null };
const timestamp = "2026-09-01T00:00:00Z";
const booking: Booking = { id: "booking-1", businessId: "business-1", status: "DRAFT", contactId: "contact-1", resourceIds: ["resource-1"], checkInDate: "2026-09-24", checkOutDate: "2026-09-26", adults: 2, children: 0, notes: null, createdAt: timestamp, updatedAt: timestamp };
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const clients: QueryClient[] = [];
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function PaymentRouteProbe() {
  const navigate = useNavigate();
  return <><h1>Cuenta de reserva</h1><button onClick={() => navigate(-1)}>Atrás del navegador</button></>;
}

function setup(route: "edit" | "confirm", options: { deferConfirm?: boolean; deferCalculate?: boolean; deferEdit?: boolean; suppliedBusinessId?: string; pricedPending?: boolean; total?: number; initialEntries?: string[] } = {}) {
  const requests: RequestRecord[] = [];
  const currentBooking = { ...booking, status: route === "edit" ? "DRAFT" as const : "PENDING" as const,
    ...(options.pricedPending ? { financialSummary: { totalAmountMinor: options.total ?? 400000, paidAmountMinor: 0, currency: "PYG" } } : {}),
  };
  const pending = deferred<Response>();
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = requestUrl(input instanceof Request ? input.url : input).pathname;
    const method = init.method ?? "GET";
    requests.push({ method, path, body: init.body ? JSON.parse(String(init.body)) : null, signal: init.signal });
    if (method === "PATCH" && path.endsWith("/bookings/booking-1")) return options.deferEdit ? pending.promise : Promise.resolve(json(currentBooking));
    if (method === "POST" && path.endsWith("/confirm")) return options.deferConfirm ? pending.promise : Promise.resolve(json({ ...currentBooking, status: "CONFIRMED" }));
    if (method === "POST" && path.endsWith("/calculate")) return options.deferCalculate ? pending.promise : Promise.resolve(json({ nights: 2, totalAmountMinor: 200000, currency: "PYG" }));
    if (method === "GET" && path.endsWith("/bookings/booking-1")) return Promise.resolve(json(currentBooking));
    if (method === "GET" && path.endsWith("/contacts")) return Promise.resolve(json([{ id: "contact-1", fullName: "Contacto", status: "ACTIVE" }]));
    if (method === "GET" && path.endsWith("/resources")) return Promise.resolve(json([{ id: "resource-1", businessId: "business-1", name: "Cabaña", status: "ACTIVE", capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2 }]));
    if (method === "GET" && path.endsWith("/rate-plans")) return Promise.resolve(json([{ id: "plan-1", businessId: "business-1", name: "Normal", currency: "PYG", baseNightlyAmountMinor: 100000, status: "ACTIVE", resources: [], validFrom: null, validTo: null, createdAt: timestamp, updatedAt: timestamp }]));
    throw new Error(`Solicitud inesperada: ${method} ${path}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const view = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={options.initialEntries ?? [`/app/bookings/booking-1/${route}`]}><Routes>
    <Route path="/app/bookings" element={<h1>Listado de reservas</h1>} />
    <Route path="/app/bookings/:bookingId/edit" element={<EditBookingPage businessId={options.suppliedBusinessId} />} />
    <Route path="/app/bookings/:bookingId/confirm" element={<ConfirmBookingPage />} />
    <Route path="/app/bookings/:bookingId" element={<h1>Detalle de reserva</h1>} />
    <Route path="/app/bookings/:bookingId/payments" element={<PaymentRouteProbe />} />
  </Routes></MemoryRouter></QueryClientProvider>;
  const page = render(view());
  return { requests, pending, currentBooking, client, page, view, user: userEvent.setup() };
}

beforeEach(() => {
  context.authStatus = "authenticated"; context.businessStatus = "ready"; context.role = "OWNER";
  context.businessId = "business-1"; context.activeBusinessId = "business-1";
  context.session = { user: { id: "user-1", email: "user@example.test", status: "ACTIVE" }, accessToken: "fixture-token", refreshToken: "fixture-refresh", tokenType: "Bearer", expiresIn: 3600, memberships: [{ businessId: "business-1", role: "OWNER" }] };
});
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });

describe("ruta antigua de confirmación con precio Pendiente", () => {
  it.each(["OWNER", "ADMIN", "RECEPTIONIST"])("redirige a Pagos para %s tras comprobar permiso y leer sólo la reserva", async (role) => {
    context.role = role;
    const { requests } = setup("confirm", { pricedPending: true });
    expect(await screen.findByRole("heading", { name: "Cuenta de reserva" })).toBeInTheDocument();
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ method: "GET", path: expect.stringMatching(/\/businesses\/business-1\/bookings\/booking-1$/) });
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
  });

  it("redirige también precio cero y Back omite la pantalla retirada del historial", async () => {
    const { requests, user } = setup("confirm", { pricedPending: true, total: 0, initialEntries: ["/app/bookings", "/app/bookings/booking-1/confirm"] });
    await screen.findByRole("heading", { name: "Cuenta de reserva" });
    await user.click(screen.getByRole("button", { name: "Atrás del navegador" }));
    expect(await screen.findByRole("heading", { name: "Listado de reservas" })).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it("VIEWER continúa denegado en URL de confirmación antes de cualquier lectura o redirección", () => {
    context.role = "VIEWER";
    const { requests } = setup("confirm", { pricedPending: true });
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para confirmar");
    expect(screen.queryByRole("heading", { name: "Cuenta de reserva" })).not.toBeInTheDocument();
    expect(requests).toEqual([]);
  });
});

describe.each(["edit", "confirm"] as const)("URL directa de reserva /%s", (route) => {
  it.each([
    ["VIEWER", () => { context.role = "VIEWER"; }],
    ["rol vacío", () => { context.role = ""; }],
    ["rol nulo", () => { context.role = null; }],
    ["sesión ausente", () => { context.session = null; }],
    ["restaurando sesión", () => { context.authStatus = "restoring"; }],
    ["no autenticado", () => { context.authStatus = "unauthenticated"; }],
    ["token vacío", () => { context.session!.accessToken = ""; }],
    ["negocio cargando", () => { context.businessStatus = "loading"; }],
    ["contexto vacío", () => { context.businessStatus = "empty"; context.businessId = ""; }],
    ["negocio sin seleccionar", () => { context.businessStatus = "selection-required"; }],
    ["error de contexto", () => { context.businessStatus = "error"; }],
    ["negocio incoherente", () => { context.activeBusinessId = "business-2"; }],
  ] as const)("rechaza %s antes de consultas o mutaciones", async (_label, changeContext) => {
    changeContext();
    const { requests } = setup(route);
    expect(screen.getByRole("alert")).toHaveTextContent(`No tienes permiso para ${route === "edit" ? "editar" : "confirmar"}`);
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByRole("group", { name: "Modo de precio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Guardar cambios|Confirmar reserva|Calcular precio/ })).not.toBeInTheDocument();
    await act(async () => { await Promise.resolve(); });
    expect(requests).toEqual([]);
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST"])("conserva operación actual para %s", async (role) => {
    context.role = role;
    const { user, requests } = setup(route);
    if (route === "edit") {
      await user.click(await screen.findByRole("button", { name: "Guardar cambios" }));
      await screen.findByRole("heading", { name: "Detalle de reserva" });
      expect(requests.filter((item) => item.method === "PATCH")).toEqual([expect.objectContaining({ path: "/api/businesses/business-1/bookings/booking-1", body: { contactId: "contact-1", resourceIds: ["resource-1"], checkInDate: "2026-09-24", checkOutDate: "2026-09-26", adults: 2, children: 0, notes: null } })]);
    } else {
      const calculate = await screen.findByRole("button", { name: "Calcular precio" });
      await waitFor(() => expect(calculate).toBeEnabled());
      expect(screen.queryByRole("button", { name: "Manual" }) !== null).toBe(role !== "RECEPTIONIST");
      await user.click(calculate);
      await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
      await screen.findByRole("heading", { name: "Detalle de reserva" });
      expect(requests.filter((item) => item.method === "POST" && item.path.endsWith("/confirm"))).toEqual([expect.objectContaining({ body: { pricing: [{ resourceId: "resource-1", ratePlanId: "plan-1" }] } })]);
    }
  });
});

it("rechaza editar un negocio suministrado distinto del negocio activo", () => {
  const { requests } = setup("edit", { suppliedBusinessId: "business-2" });
  expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para editar");
  expect(requests).toEqual([]);
});

it.each(["VIEWER", "RECEPTIONIST", "sesión", "contexto"])("aborta confirmación pendiente y descarta respuesta al cambiar %s", async (change) => {
  const { user, requests, pending, page, view, currentBooking, client } = setup("confirm", { deferConfirm: true });
  const calculate = await screen.findByRole("button", { name: "Calcular precio" });
  await waitFor(() => expect(calculate).toBeEnabled());
  await user.click(calculate);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
  await waitFor(() => expect(requests.some((item) => item.path.endsWith("/confirm"))).toBe(true));
  const request = requests.find((item) => item.path.endsWith("/confirm"))!;
  if (change === "sesión") { context.session = null; context.authStatus = "unauthenticated"; }
  else if (change === "contexto") context.businessStatus = "loading";
  else context.role = change;
  page.rerender(view());
  expect(request.signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(json({ ...currentBooking, status: "CONFIRMED" })); await pending.promise; });
  expect(screen.queryByRole("heading", { name: "Detalle de reserva" })).not.toBeInTheDocument();
  expect(invalidate).not.toHaveBeenCalled();
  expect(requests.filter((item) => item.path.endsWith("/confirm"))).toHaveLength(1);
  if (change === "RECEPTIONIST") {
    expect(await screen.findByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    expect(screen.queryByText("Total calculado")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
  } else expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para confirmar");
});

it("descarta cálculo pendiente al cambiar entre roles con permiso de escritura", async () => {
  const { user, requests, pending, page, view } = setup("confirm", { deferCalculate: true });
  const calculate = await screen.findByRole("button", { name: "Calcular precio" });
  await waitFor(() => expect(calculate).toBeEnabled());
  await user.click(calculate);
  const request = requests.find((item) => item.path.endsWith("/calculate"))!;
  context.role = "ADMIN"; page.rerender(view());
  expect(request.signal?.aborted).toBe(true);
  await act(async () => { pending.resolve(json({ nights: 2, totalAmountMinor: 200000, currency: "PYG" })); await pending.promise; });
  expect(screen.queryByText("Total calculado")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  expect(requests.filter((item) => item.path.endsWith("/confirm"))).toEqual([]);
});

it("no navega al responder la edición después de perder el rol de escritura", async () => {
  const { user, requests, pending, page, view, currentBooking } = setup("edit", { deferEdit: true });
  await user.click(await screen.findByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1));
  context.role = "VIEWER"; page.rerender(view());
  expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para editar");
  await act(async () => { pending.resolve(json(currentBooking)); await pending.promise; });
  expect(screen.queryByRole("heading", { name: "Detalle de reserva" })).not.toBeInTheDocument();
  expect(requests.filter((item) => item.method === "PATCH")).toHaveLength(1);
});
