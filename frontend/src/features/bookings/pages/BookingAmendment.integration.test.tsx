import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { requestUrl } from "../../../../tests/request-url";
import type { Booking, BookingStatus } from "../types/booking.types";
import type { BookingAmendmentInput, BookingAmendmentPreview, SaveBookingAmendmentInput } from "../types/booking-amendment.types";
import { EditBookingPage } from "./EditBookingPage";

const context = vi.hoisted(() => ({ role: "OWNER", businessId: "business-1", entityId: "business-1", entityStatus: "ACTIVE", userId: "user-1", authStatus: "authenticated", businessStatus: "ready" }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: context.authStatus, session: { accessToken: `synthetic-${context.userId}`, user: { id: context.userId } } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ status: context.businessStatus, activeBusinessId: context.businessId,
  activeRole: context.role, activeBusiness: { id: context.entityId, status: context.entityStatus, name: "Alojamiento de prueba", currency: "PYG", timezone: "America/Asuncion" } }) }));
const clients: QueryClient[] = [];
beforeEach(() => { Object.assign(context, { role: "OWNER", businessId: "business-1", entityId: "business-1", entityStatus: "ACTIVE", userId: "user-1", authStatus: "authenticated", businessStatus: "ready" }); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.unstubAllGlobals(); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

function setup(options: { status?: BookingStatus; legacy?: boolean; conflictSave?: boolean; deferPreview?: boolean } = {}) {
  const status = options.status ?? "CONFIRMED";
  const paid = status === "PENDING" ? 0 : 250000;
  const booking: Booking = { id: "booking-1", businessId: "business-1", status, contactId: "contact-1", resourceIds: ["resource-1"],
    checkInDate: "2026-10-05", checkOutDate: "2026-10-07", adults: 2, children: 0, notes: null,
    createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z",
    financialSummary: { totalAmountMinor: options.legacy ? null : 400000, paidAmountMinor: paid, currency: options.legacy ? null : "PYG", outstandingAmountMinor: 400000 - paid, creditAmountMinor: 0 } };
  const requests: Array<{ method: string; path: string; body: unknown; signal?: AbortSignal | null }> = [];
  const previews: BookingAmendmentPreview[] = [];
  let conflict = options.conflictSave;
  let resolvePreview!: () => void;
  const resource = { id: "resource-1", businessId: "business-1", name: "Cabaña", status: "ACTIVE", capacityMaximum: 4, capacityMaximumChildren: 2 };
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const path = requestUrl(input instanceof Request ? input.url : input).pathname;
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, path, body, signal: init.signal });
    if (path.endsWith("/amendment-preview")) {
      const changes = body as BookingAmendmentInput;
      const pricing = changes.pricing?.[0];
      const total = pricing ? pricing.pricingMode === "MANUAL_NO_RATE_PLAN" ? pricing.agreedAmountMinor : 600000 : 400000;
      const item = { resourceId: "resource-1", ratePlanId: null, pricingMode: "MANUAL_NO_RATE_PLAN" as const, suggestedAmountMinor: null, agreedAmountMinor: total, adjustmentAmountMinor: null, overrideReason: "Acuerdo original", nights: 2, breakdown: [] };
      const preview: BookingAmendmentPreview = { bookingId: booking.id, status: booking.status, expectedUpdatedAt: booking.updatedAt,
        currentPricingId: "snapshot-1", expectedPaidAmountMinor: booking.financialSummary!.paidAmountMinor,
        currentPricing: { id: "snapshot-1", originalSnapshotId: "snapshot-1", pricingRevisionId: null, revisionNumber: 0, businessId: booking.businessId, bookingId: booking.id, currency: "PYG", totalAmountMinor: 400000, items: [{ ...item, agreedAmountMinor: 400000 }], createdAt: booking.createdAt },
        quote: { currency: "PYG", totalAmountMinor: total, items: [item], fingerprint: (changes.notes ? "a" : "f").repeat(64) },
        financialSummary: { totalAmountMinor: total, paidAmountMinor: booking.financialSummary!.paidAmountMinor,
          outstandingAmountMinor: Math.max(total - booking.financialSummary!.paidAmountMinor, 0), creditAmountMinor: Math.max(booking.financialSummary!.paidAmountMinor - total, 0) }, warnings: total < paid ? ["El plan de pagos requiere conciliación."] : [] };
      previews.push(preview);
      if (options.deferPreview) return new Promise<Response>((resolve) => { resolvePreview = () => resolve(json(preview)); });
      return json(preview);
    }
    if (method === "PATCH" && path.endsWith("/amendment")) {
      if (conflict) { conflict = false; booking.updatedAt = "2026-10-02T00:01:00.000Z"; booking.financialSummary!.paidAmountMinor += 1; return json({ message: "Los pagos cambiaron" }, 409); }
      const changes = body as SaveBookingAmendmentInput;
      Object.assign(booking, { contactId: changes.contactId, checkInDate: changes.checkInDate, checkOutDate: changes.checkOutDate, adults: changes.adults, children: changes.children, notes: changes.notes, updatedAt: "2026-10-02T00:02:00.000Z" });
      return json(booking);
    }
    if (method === "GET" && path.endsWith("/bookings/booking-1")) return json(booking);
    if (path.endsWith("/contacts")) return json([{ id: "contact-1", fullName: "Contacto original", status: "ACTIVE" }, { id: "contact-2", fullName: "Contacto nuevo", status: "ACTIVE" }]);
    if (path.endsWith("/resources")) return json([resource]);
    if (path.endsWith("/rate-plans")) return json([{ id: "rate-1", name: "Normal", currency: "PYG", status: "ACTIVE", baseNightlyAmountMinor: 300000 }]);
    throw new Error(`Request inesperado ${method} ${path}`);
  }));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  const view = () => <QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/bookings/booking-1/edit"]}><Routes>
    <Route path="/app/bookings/:bookingId/edit" element={<EditBookingPage />} /><Route path="/app/bookings/:bookingId" element={<h1>Detalle de reserva</h1>} />
  </Routes></MemoryRouter></QueryClientProvider>;
  const page = render(view());
  return { booking, requests, previews, client, user: userEvent.setup(), page, view, resolvePreview: () => resolvePreview() };
}

async function manualPrice(user: ReturnType<typeof userEvent.setup>, amount = "100000") {
  await user.click(screen.getByLabelText("Cambiar tarifa o precio"));
  await user.click(screen.getByRole("button", { name: "Manual" }));
  fireEvent.change(screen.getByLabelText("Precio final"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText("Motivo del precio manual"), { target: { value: "Nuevo acuerdo" } });
}

describe("edición de reservas con preview obligatorio", () => {
  it.each(["PENDING", "CONFIRMED"] as const)("%s conserva precio al editar contacto/notas y guarda sólo después de revisar", async (status) => {
    const { requests, previews, user } = setup({ status });
    await screen.findByRole("heading", { name: "Editar reserva" });
    await screen.findByLabelText("Contacto");
    expect(screen.getByLabelText("Alojamiento")).toBeDisabled();
    await user.selectOptions(screen.getByLabelText("Contacto"), "contact-2");
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Llegada por la tarde" } });
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    expect(await screen.findByRole("heading", { name: "Revisión de cambios" })).toBeVisible();
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
    const previewRequest = requests.find((request) => request.path.endsWith("/amendment-preview"))!;
    expect(previewRequest.body).toMatchObject({ contactId: "contact-2", notes: "Llegada por la tarde", checkInDate: "2026-10-05", checkOutDate: "2026-10-07" });
    expect(previewRequest.body).not.toHaveProperty("pricing"); expect(previewRequest.body).not.toHaveProperty("resourceIds"); expect(previewRequest.body).not.toHaveProperty("reason");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await screen.findByRole("heading", { name: "Detalle de reserva" });
    expect(requests.find((request) => request.method === "PATCH")?.body).toEqual({ ...(previewRequest.body as object), expectedUpdatedAt: previews[0].expectedUpdatedAt, currentPricingId: previews[0].currentPricingId, expectedPaidAmountMinor: previews[0].expectedPaidAmountMinor, acceptedQuote: previews[0].quote });
    expect(requests.some((request) => request.path.endsWith("/confirm") || request.path.endsWith("/submit"))).toBe(false);
  });

  it("muestra crédito y warning sin refund y descarta la revisión al cambiar datos", async () => {
    const { requests, user } = setup(); await screen.findByLabelText("Contacto"); await manualPrice(user);
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await screen.findByRole("heading", { name: "Revisión de cambios" });
    const summary = within(screen.getByRole("complementary"));
    expect(summary.getByText("Saldo a favor")).toBeVisible();
    expect(summary.getByText("El plan de pagos requiere conciliación.")).toBeVisible();
    expect(summary.getByText(/no genera devoluciones/)).toBeVisible();
    expect(summary.getByText("Pagado").nextElementSibling).toHaveTextContent("250.000");
    expect(summary.getByText("Saldo a favor").nextElementSibling).toHaveTextContent("150.000");
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Cambio posterior" } });
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revisión de cambios" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await screen.findByRole("heading", { name: "Revisión de cambios" });
    expect(requests.filter((request) => request.path.endsWith("/amendment-preview"))).toHaveLength(2);
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });

  it("un cambio de fechas exige tarifa explícita y Recepción no puede elegir Manual", async () => {
    context.role = "RECEPTIONIST"; const { requests, user } = setup(); await screen.findByLabelText("Entrada");
    fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: "2026-10-06" } });
    expect(screen.getByRole("button", { name: "Revisar cambios" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Cambiar tarifa o precio")).not.toBeInTheDocument();
    const rate = screen.getByLabelText("Tarifa para esta estadía"); await waitFor(() => expect(rate).toBeEnabled());
    await user.selectOptions(rate, "rate-1"); await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await screen.findByRole("heading", { name: "Revisión de cambios" });
    expect(requests.find((request) => request.path.endsWith("/amendment-preview"))?.body).toMatchObject({ checkInDate: "2026-10-06", pricing: [{ resourceId: "resource-1", ratePlanId: "rate-1" }] });
  });

  it("409 por pago concurrente exige otra revisión con tokens nuevos y no reenvía automáticamente", async () => {
    const { requests, previews, user } = setup({ conflictSave: true }); await screen.findByLabelText("Contacto");
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await screen.findByRole("heading", { name: "Revisión de cambios" });
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Revisá los cambios otra vez");
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await screen.findByText(/La reserva cambió antes de revisar/);
    await waitFor(() => expect(screen.getByRole("button", { name: "Revisar cambios" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await screen.findByRole("heading", { name: "Revisión de cambios" });
    await user.click(screen.getByRole("button", { name: "Guardar cambios" })); await screen.findByRole("heading", { name: "Detalle de reserva" });
    expect(previews[1].expectedPaidAmountMinor).toBe(previews[0].expectedPaidAmountMinor + 1);
    expect(requests.filter((request) => request.method === "PATCH")[1].body).toMatchObject({ expectedUpdatedAt: previews[2].expectedUpdatedAt, expectedPaidAmountMinor: previews[2].expectedPaidAmountMinor, acceptedQuote: previews[2].quote });
  });

  it.each(["IN_PROGRESS", "COMPLETED", "NO_SHOW", "CANCELLED"] as const)("no habilita edición de %s ni monta consultas operativas", async (status) => {
    const { requests } = setup({ status }); expect(await screen.findByRole("alert")).toHaveTextContent("Esta reserva ya no es editable");
    expect(requests).toHaveLength(1); expect(document.querySelector("form")).toBeNull();
  });
  it("Pending histórica sin snapshot conserva la denegación de edición", async () => {
    const { requests } = setup({ status: "PENDING", legacy: true }); expect(await screen.findByRole("alert")).toHaveTextContent("Esta reserva ya no es editable"); expect(requests).toHaveLength(1);
  });
  it("VIEWER no consulta ni publica preview o edición", () => {
    context.role = "VIEWER"; const { requests } = setup(); expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para editar"); expect(requests).toEqual([]);
  });
  it("negocio archivado conserva lectura y no monta el editor operativo", async () => {
    context.entityStatus = "ARCHIVED"; const { requests } = setup();
    expect(await screen.findByRole("alert")).toHaveTextContent("Esta reserva ya no es editable");
    expect(requests).toHaveLength(1); expect(document.querySelector("form")).toBeNull();
  });
  it("contexto tenant incoherente se rechaza antes de cualquier consulta", () => {
    context.entityId = "business-2"; const { requests } = setup();
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para editar"); expect(requests).toEqual([]);
  });
  it("GETv1 seguido de previewv2 descarta datos viejos, recarga y exige revisión explícita", async () => {
    const { booking, requests, user } = setup(); await screen.findByLabelText("Contacto");
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Cambio local" } });
    booking.contactId = "contact-2"; booking.notes = "Cambio de otra persona"; booking.updatedAt = "2026-10-02T00:01:00.000Z";
    await user.click(screen.getByRole("button", { name: "Revisar cambios" }));
    await screen.findByText(/La reserva cambió antes de revisar/);
    await waitFor(() => expect(screen.getByLabelText("Contacto")).toHaveValue("contact-2"));
    expect(screen.getByLabelText("Notas")).toHaveValue("Cambio de otra persona");
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(requests.filter((request) => request.path.endsWith("/amendment-preview"))).toHaveLength(1);
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await screen.findByRole("heading", { name: "Revisión de cambios" });
    expect(requests.filter((request) => request.path.endsWith("/amendment-preview"))[1].body).toMatchObject({ contactId: "contact-2", notes: "Cambio de otra persona" });
  });
  it("un GET externo de versión nueva resetea el formulario y descarta su revisión", async () => {
    const { booking, client, user } = setup(); await screen.findByLabelText("Contacto");
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await screen.findByRole("heading", { name: "Revisión de cambios" });
    booking.notes = "Datos actualizados"; booking.updatedAt = "2026-10-02T00:01:00.000Z";
    await act(async () => { await client.refetchQueries({ queryKey: ["bookings", "business-1", "booking-1"] }); });
    await waitFor(() => expect(screen.getByLabelText("Notas")).toHaveValue("Datos actualizados"));
    expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Revisión de cambios" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("La reserva cambió");
  });
  it("cambiar de identidad aborta preview y su respuesta tardía no altera el formulario nuevo", async () => {
    const { requests, page, view, user, resolvePreview } = setup({ deferPreview: true }); await screen.findByLabelText("Contacto");
    await user.click(screen.getByRole("button", { name: "Revisar cambios" })); await waitFor(() => expect(requests.some((request) => request.path.endsWith("/amendment-preview"))).toBe(true));
    context.userId = "user-2"; page.rerender(view()); await screen.findByLabelText("Contacto");
    fireEvent.change(screen.getByLabelText("Notas"), { target: { value: "Borrador nuevo" } });
    await act(async () => resolvePreview());
    expect(requests.find((request) => request.path.endsWith("/amendment-preview"))?.signal?.aborted).toBe(true);
    expect(screen.getByLabelText("Notas")).toHaveValue("Borrador nuevo"); expect(screen.queryByRole("heading", { name: "Revisión de cambios" })).not.toBeInTheDocument();
    expect(requests.filter((request) => request.method === "PATCH")).toHaveLength(0);
  });
});
