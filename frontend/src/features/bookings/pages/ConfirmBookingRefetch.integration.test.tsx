import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "../../auth/context/AuthContext";
import { BusinessProvider, useBusinessContext } from "../../business/context/BusinessContext";
import { API_ERROR_MESSAGES } from "../../../shared/api/api-client";
import { requestUrl } from "../../../../tests/request-url";
import type { Booking } from "../types/booking.types";
import type { RatePlan } from "../../pricing/types/pricing.types";
import { ConfirmBookingPage } from "./ConfirmBookingPage";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const timestamps = { createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z" };
const plan: RatePlan = { ...timestamps, id: "plan-1", businessId: "business-1", name: "Tarifa disponible", description: null, baseNightlyAmountMinor: 100000, currency: "PYG", status: "ACTIVE", validFrom: null, validTo: null, resources: [] };
const booking: Booking = { ...timestamps, id: "booking-1", businessId: "business-1", status: "PENDING", contactId: "contact-1", resourceIds: ["resource-1"], checkInDate: "2026-09-24", checkOutDate: "2026-09-26", adults: 2, children: 0, notes: null };
const businesses = ["business-1", "business-2"].map((id) => ({ ...timestamps, id, name: id, legalName: null, taxId: null, timezone: "America/Asuncion", currency: "PYG", status: "ACTIVE" }));

// Controles del harness: cambian los proveedores y la ruta reales, sin sustituir hooks.
function SessionControls() {
  const { establishSession } = useAuth();
  return ["user-1", "user-2"].map((id) => <button key={id} onClick={() => establishSession({
    user: { id, email: `${id}@example.test`, status: "ACTIVE" },
    accessToken: `token-${id}`, refreshToken: `refresh-${id}`, tokenType: "Bearer", expiresIn: 3600,
    memberships: businesses.map((business) => ({ businessId: business.id, role: "OWNER" })),
  })}>{id}</button>);
}
function BusinessControls() {
  const { businesses: available, selectBusiness, status } = useBusinessContext();
  return <>
    {available.map((business) => <button key={business.id} onClick={() => selectBusiness(business.id)}>{business.id}</button>)}
    <Link to="/app/bookings/booking-2/confirm">Otra reserva</Link>
    {status === "ready" && <Routes>
      <Route path="/app/bookings/:bookingId/confirm" element={<ConfirmBookingPage />} />
      <Route path="/app/bookings/:bookingId" element={<h1>Detalle de reserva</h1>} />
    </Routes>}
  </>;
}
const clients: QueryClient[] = [];
beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  focusManager.setFocused(undefined);
  vi.unstubAllGlobals();
});

async function setup() {
  const rateRequests: { url: URL; signal?: AbortSignal | null; authorization: string | null; pending: ReturnType<typeof deferred<Response>> }[] = [];
  const posts: { path: string; body: unknown; signal?: AbortSignal | null }[] = [];
  const currentBooking = { ...booking };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = requestUrl(input instanceof Request ? input.url : input);
    const path = url.pathname;
    if (init.method === "POST") {
      posts.push({ path, body: JSON.parse(String(init.body)), signal: init.signal });
      if (path.endsWith("/calculate")) return Promise.resolve(json({ nights: 2, totalAmountMinor: 200000, currency: "PYG" }));
      if (path.endsWith("/confirm")) return Promise.resolve(json({ ...currentBooking, status: "CONFIRMED" }));
    }
    if (path.endsWith("/businesses")) return Promise.resolve(json(businesses));
    if (path.endsWith("/resources")) return Promise.resolve(json(["resource-1", "resource-2"].map((id) => ({ id, name: `Cabaña ${id}` }))));
    if (/\/bookings\/booking-[12]$/.test(path)) return Promise.resolve(json({ ...currentBooking, id: path.split("/").at(-1), businessId: path.split("/").at(-3) }));
    if (path.endsWith("/rate-plans")) {
      const pending = deferred<Response>();
      rateRequests.push({ url, signal: init.signal, authorization: new Headers(init.headers).get("Authorization"), pending });
      return pending.promise;
    }
    throw new Error(`Solicitud inesperada: ${init.method ?? "GET"} ${url}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const user = userEvent.setup();
  render(<QueryClientProvider client={client}><AuthProvider><MemoryRouter initialEntries={["/app/bookings/booking-1/confirm"]}>
    <SessionControls /><BusinessProvider><BusinessControls /></BusinessProvider>
  </MemoryRouter></AuthProvider></QueryClientProvider>);
  await user.click(screen.getByRole("button", { name: "user-1" }));
  await user.click(await screen.findByRole("button", { name: "business-1" }));
  await waitFor(() => expect(rateRequests).toHaveLength(1));
  await act(async () => rateRequests[0].pending.resolve(json([])));
  await user.type(await screen.findByLabelText("Precio final"), "450.000");
  await user.tab();
  expect(screen.getByLabelText("Motivo del precio manual")).toHaveFocus();
  await user.keyboard("Acuerdo directo");
  expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
  expect(posts).toEqual([]);
  return { client, user, rateRequests, posts, currentBooking };
}
const confirmButton = () => screen.getByRole("button", { name: "Confirmar reserva" });
function expectEdition(amount: HTMLElement, reason: HTMLElement) {
  expect(screen.getByLabelText("Precio final")).toBe(amount);
  expect(amount).toHaveValue("450.000");
  expect(screen.getByLabelText("Motivo del precio manual")).toBe(reason);
  expect(reason).toHaveValue("Acuerdo directo");
}
function expectManualPayload(posts: { path: string; body: unknown }[], resourceId = "resource-1", amount = 450000, reason = "Acuerdo directo") {
  expect(posts).toEqual([expect.objectContaining({
    path: expect.stringMatching(/\/bookings\/booking-[12]\/confirm$/),
    body: { pricing: [{ resourceId, pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: amount, overrideReason: reason }] },
  })]);
}

// A–D: transporte diferido y hooks/proveedores reales, sin QA interactiva.
describe("ConfirmBookingPage: edición manual durante la actualización de tarifarios", () => {
  it.each(["Volver a consultar", "refetch automático"])("A: conserva DOM, valores y foco con %s y otra respuesta vacía", async (trigger) => {
    const { user, rateRequests, posts } = await setup();
    const amount = screen.getByLabelText("Precio final");
    const reason = screen.getByLabelText("Motivo del precio manual");
    if (trigger === "Volver a consultar") await user.click(screen.getByRole("button", { name: trigger }));
    else act(() => { focusManager.setFocused(false); focusManager.setFocused(true); });
    await waitFor(() => expect(rateRequests).toHaveLength(2));
    expect(await screen.findByRole("status")).toHaveTextContent("Actualizando tarifarios");
    expectEdition(amount, reason);
    expect(confirmButton()).toBeDisabled();
    expect(posts).toEqual([]);
    if (trigger === "Volver a consultar") await user.click(reason);
    expect(reason).toHaveFocus();
    await act(async () => rateRequests[1].pending.resolve(json([])));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expectEdition(amount, reason);
    expect(reason).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(posts).toEqual([]);
    await user.click(confirmButton());
    await screen.findByRole("heading", { name: "Detalle de reserva" });
    expectManualPayload(posts);
  });

  it("B: conserva la edición ante error y recupera por teclado sin robar foco ni enviar POST", async () => {
    const { user, rateRequests, posts } = await setup();
    const amount = screen.getByLabelText("Precio final");
    const reason = screen.getByLabelText("Motivo del precio manual");
    await user.tab();
    expect(screen.getByRole("button", { name: "Volver a consultar" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(rateRequests).toHaveLength(2));
    await act(async () => rateRequests[1].pending.resolve(json({}, 503)));
    expect(await screen.findByRole("alert")).toHaveTextContent(API_ERROR_MESSAGES.server);
    expectEdition(amount, reason);
    expect(confirmButton()).toBeDisabled();
    await user.click(confirmButton());
    expect(posts).toEqual([]);
    const retry = screen.getByRole("button", { name: "Reintentar tarifarios" });
    await user.click(reason);
    await user.tab();
    expect(retry).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(rateRequests).toHaveLength(3));
    expectEdition(amount, reason);
    expect(confirmButton()).toBeDisabled();
    await user.tab();
    const cancel = screen.getByRole("button", { name: "Cancelar" });
    expect(cancel).toHaveFocus();
    await act(async () => rateRequests[2].pending.resolve(json([])));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expectEdition(amount, reason);
    expect(cancel).toHaveFocus();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(posts).toEqual([]);
    await user.tab();
    expect(confirmButton()).toHaveFocus();
    await user.keyboard("{Enter}");
    await screen.findByRole("heading", { name: "Detalle de reserva" });
    expectManualPayload(posts);
  });

  it("C: un tarifario retira la excepción, descarta sus valores y exige cálculo y referencia", async () => {
    const { client, user, rateRequests, posts } = await setup();
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(rateRequests).toHaveLength(2));
    await act(async () => rateRequests[1].pending.resolve(json([plan])));
    expect(await screen.findByRole("combobox")).toHaveValue("plan-1");
    expect(screen.queryByLabelText("Precio final")).not.toBeInTheDocument();
    expect(screen.queryByText("Total manual acordado")).not.toBeInTheDocument();
    expect(confirmButton()).toBeDisabled();
    await user.click(confirmButton());
    expect(posts).toEqual([]);
    act(() => { void client.invalidateQueries({ queryKey: ["rate-plans", "selectable"] }); });
    await waitFor(() => expect(rateRequests).toHaveLength(3));
    await act(async () => rateRequests[2].pending.resolve(json([])));
    expect(await screen.findByLabelText("Precio final")).toHaveValue("");
    expect(screen.getByLabelText("Motivo del precio manual")).toHaveValue("");
    expect(confirmButton()).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(rateRequests).toHaveLength(4));
    await act(async () => rateRequests[3].pending.resolve(json([plan])));
    await screen.findByRole("combobox");
    expect(posts).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Calcular precio" }));
    await waitFor(() => expect(confirmButton()).toBeEnabled());
    expect(posts).toEqual([expect.objectContaining({ path: expect.stringMatching(/\/rate-plans\/plan-1\/calculate$/), body: { resourceId: "resource-1", checkIn: "2026-09-24", checkOut: "2026-09-26" } })]);
    await user.click(confirmButton());
    await screen.findByRole("heading", { name: "Detalle de reserva" });
    expect(posts).toHaveLength(2);
    expect(posts[1].body).toEqual({ pricing: [{ resourceId: "resource-1", ratePlanId: "plan-1" }] });
  });

  it.each(["identidad", "Business", "Booking", "Resource", "checkIn", "checkOut"])("D: %s descarta valores, cancela la consulta y rechaza la respuesta tardía", async (change) => {
    const { client, user, rateRequests, posts, currentBooking } = await setup();
    await user.click(screen.getByRole("button", { name: "Volver a consultar" }));
    await waitFor(() => expect(rateRequests).toHaveLength(2));
    const previous = rateRequests[1];
    if (change === "identidad") {
      await user.click(screen.getByRole("button", { name: "user-2" }));
      await user.click(await screen.findByRole("button", { name: "business-1" }));
    } else if (change === "Business") await user.click(screen.getByRole("button", { name: "business-2" }));
    else if (change === "Booking") await user.click(screen.getByRole("link", { name: "Otra reserva" }));
    else {
      if (change === "Resource") currentBooking.resourceIds = ["resource-2"];
      else if (change === "checkIn") currentBooking.checkInDate = "2026-09-23";
      else currentBooking.checkOutDate = "2026-09-27";
      await act(async () => { await client.invalidateQueries({ queryKey: ["bookings", "business-1", "booking-1"] }); });
    }
    await waitFor(() => expect(previous.signal?.aborted).toBe(true));
    await waitFor(() => expect(rateRequests).toHaveLength(3));
    const next = rateRequests[2];
    expect(next.url.pathname).toContain(`/businesses/${change === "Business" ? "business-2" : "business-1"}/`);
    expect(next.authorization).toBe(`Bearer token-${change === "identidad" ? "user-2" : "user-1"}`);
    expect(Object.fromEntries(next.url.searchParams)).toEqual({ resourceId: currentBooking.resourceIds[0], checkIn: currentBooking.checkInDate, checkOut: currentBooking.checkOutDate });
    await act(async () => next.pending.resolve(json([])));
    expect(await screen.findByLabelText("Precio final")).toHaveValue("");
    expect(screen.getByLabelText("Motivo del precio manual")).toHaveValue("");
    expect(confirmButton()).toBeDisabled();
    await user.type(screen.getByLabelText("Precio final"), "300.000");
    await user.tab();
    await user.keyboard("Nuevo acuerdo");
    const reason = screen.getByLabelText("Motivo del precio manual");
    await act(async () => previous.pending.resolve(json([plan])));
    expect(reason).toHaveFocus();
    expect(screen.getByLabelText("Precio final")).toHaveValue("300.000");
    expect(reason).toHaveValue("Nuevo acuerdo");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(confirmButton()).toBeEnabled();
    expect(posts).toEqual([]);
    await user.click(confirmButton());
    await screen.findByRole("heading", { name: "Detalle de reserva" });
    expectManualPayload(posts, currentBooking.resourceIds[0], 300000, "Nuevo acuerdo");
    expect(posts[0].path).toContain(`/businesses/${change === "Business" ? "business-2" : "business-1"}/bookings/${change === "Booking" ? "booking-2" : "booking-1"}/confirm`);
  });
});
