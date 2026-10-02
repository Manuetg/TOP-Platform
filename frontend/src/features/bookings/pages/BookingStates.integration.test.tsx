import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BookingTimeline } from "../components/BookingTimeline";
import type { Booking, BookingStatus, BookingTimelineItem } from "../types/booking.types";
import { BookingDetailPage } from "./BookingDetailPage";
import { BookingListPage } from "./BookingListPage";

const context = vi.hoisted(() => ({ role: "OWNER" as string | null }));

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    session: { accessToken: "access-token", user: { id: "user-1" } },
  }),
}));
vi.mock("../../business/context/BusinessContext", () => ({
  useBusinessContext: () => ({
    status: "ready",
    activeBusinessId: "business-1",
    activeRole: context.role,
    activeBusiness: { id: "business-1", timezone: "America/Asuncion", currency: "PYG" },
  }),
}));
vi.mock("../../payments/components/BookingPayments", () => ({
  BookingPayments: () => null,
}));

const states: [BookingStatus, string][] = [
  ["DRAFT", "Borrador"],
  ["PENDING", "Pendiente"],
  ["CONFIRMED", "Confirmada"],
  ["IN_PROGRESS", "En curso"],
  ["COMPLETED", "Finalizada"],
  ["CANCELLED", "Cancelada"],
  ["NO_SHOW", "No show"],
];

function booking(status: BookingStatus): Booking {
  return {
    id: `${status.toLowerCase()}-booking`,
    businessId: "business-1",
    status,
    contactId: "contact-1",
    resourceIds: ["resource-1"],
    checkInDate: "2026-10-01",
    checkOutDate: "2026-10-03",
    adults: 2,
    children: 0,
    notes: null,
    createdAt: "2026-09-30T12:00:00.000Z",
    updatedAt: "2026-09-30T12:00:00.000Z",
  };
}

const bookings = states.map(([status]) => booking(status));
let currentBooking: Booking;
let timeline: BookingTimelineItem[];
let client: QueryClient;
const fetchMock = vi.fn<typeof fetch>();

function json(value: unknown) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json" } });
}

function url(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input), window.location.origin);
}

function show(path = "/app/bookings") {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/app/bookings" element={<BookingListPage />} />
          <Route path="/app/bookings/:bookingId" element={<BookingDetailPage />} />
          <Route path="/app/bookings/:bookingId/payments" element={<h1>Cuenta de reserva</h1>} />
          <Route path="/timeline" element={<BookingTimeline businessId="business-1" bookingId="cancelled-booking" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  context.role = "OWNER";
  currentBooking = booking("DRAFT");
  timeline = [];
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input, init) => {
    const request = url(input);
    if (request.pathname.endsWith("/contacts")) {
      return json([{ id: "contact-1", fullName: "Ana Pérez" }]);
    }
    if (request.pathname.endsWith("/resources")) {
      return json([{ id: "resource-1", name: "Cabaña Lapacho", capacityMaximum: 4 }]);
    }
    if (request.pathname.endsWith("/timeline")) {
      return json({ items: timeline, pageInfo: { nextCursor: null, hasNextPage: false } });
    }
    if (request.pathname.endsWith("/submit") && init?.method === "POST") {
      currentBooking = { ...currentBooking, status: "PENDING" };
      timeline = [{ id: "submitted-event", type: "BOOKING_SUBMITTED", occurredAt: "2026-10-01T12:00:00.000Z", actor: { userId: "user-1" }, details: {} }];
      return json(currentBooking);
    }
    if (request.pathname.endsWith("/cancel") && init?.method === "POST") {
      currentBooking = { ...currentBooking, status: "CANCELLED" };
      timeline = [{ id: "cancelled-event", type: "BOOKING_CANCELLED", occurredAt: "2026-10-01T12:00:00.000Z", actor: { userId: "user-1" }, details: {} }];
      return json(currentBooking);
    }
    if (request.pathname.endsWith("/bookings")) {
      const status = request.searchParams.get("status");
      return json(bookings.filter((item) => !status || item.status === status));
    }
    if (request.pathname.endsWith(`/bookings/${currentBooking.id}`)) return json(currentBooking);
    throw new Error(`Request inesperado: ${init?.method ?? "GET"} ${request.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  client?.clear();
  vi.unstubAllGlobals();
});

describe("Estados de reservas: presentación y contratos", () => {
  it.each([0, 400000])("una Pendiente con precio %s ofrece pagos y no confirmación manual", async (total) => {
    currentBooking = { ...booking("PENDING"), financialSummary: { totalAmountMinor: total, paidAmountMinor: 0, currency: "PYG" } };
    const user = userEvent.setup();
    show(`/app/bookings/${currentBooking.id}`);
    const payments = await screen.findByRole("button", { name: "Gestionar pagos" });
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    await user.click(payments);
    expect(await screen.findByRole("heading", { name: "Cuenta de reserva" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
  });

  it("una Pendiente histórica sin precio conserva la confirmación y no ofrece pagos", async () => {
    currentBooking = { ...booking("PENDING"), financialSummary: { totalAmountMinor: null, paidAmountMinor: 0, currency: null } };
    show(`/app/bookings/${currentBooking.id}`);
    expect(await screen.findByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar pagos" })).not.toBeInTheDocument();
  });

  it("VIEWER consulta pagos de una Pendiente con precio y no obtiene acciones de reserva", async () => {
    context.role = "VIEWER";
    currentBooking = { ...booking("PENDING"), financialSummary: { totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" } };
    show(`/app/bookings/${currentBooking.id}`);
    expect(await screen.findByRole("button", { name: "Gestionar pagos" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
  });

  it("mantiene los siete estados y envía sus enums originales al filtrar", async () => {
    const user = userEvent.setup();
    show();
    await screen.findByRole("heading", { name: "Reservas" });
    await user.click(screen.getByRole("button", { name: /Buscar o filtrar reservas/ }));
    const filter = screen.getByRole("combobox", { name: "Estado" });
    expect(within(filter).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent?.trim()])).toEqual([
      ["ALL", "Todos"],
      ...states,
    ]);
    for (const [status, label] of states) {
      const rows = screen.getAllByRole("button", { name: `Abrir reserva ${booking(status).id.slice(0, 8).toUpperCase()}` });
      for (const row of rows) expect(within(row).getByText(label)).toBeInTheDocument();
    }
    for (const [status, label] of states) {
      await user.selectOptions(screen.getByRole("combobox", { name: "Estado" }), status);
      await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => url(input).searchParams.get("status") === status)).toBe(true));
      await waitFor(() => {
        const rows = screen.getAllByRole("button", { name: /^Abrir reserva / });
        expect(rows).toHaveLength(2);
        for (const row of rows) expect(within(row).getByText(label)).toBeInTheDocument();
      });
      const request = fetchMock.mock.calls.find(([input]) => url(input).searchParams.get("status") === status)!;
      expect(url(request[0]).pathname).toMatch(/\/businesses\/business-1\/bookings$/);
      expect(new Headers(request[1]?.headers).get("Authorization")).toBe("Bearer access-token");
    }
  });

  it.each([
    ["COMPLETED", "Finalizada"],
    ["IN_PROGRESS", "En curso"],
    ["NO_SHOW", "No show"],
    ["PENDING", "Pendiente"],
  ] as const)("busca %s mediante etiqueta visible y valor interno sin requests adicionales", async (status, label) => {
    const user = userEvent.setup();
    show();
    await screen.findByRole("heading", { name: "Reservas" });
    await user.click(screen.getByRole("button", { name: /Buscar o filtrar reservas/ }));
    const search = screen.getByRole("searchbox", { name: "Buscar reservas" });
    const requestsBeforeSearch = fetchMock.mock.calls.length;
    for (const term of [label, status]) {
      await user.clear(search);
      await user.type(search, term);
      const rows = screen.getAllByRole("button", { name: /^Abrir reserva / });
      expect(rows).toHaveLength(2);
      for (const row of rows) expect(within(row).getByText(label)).toBeInTheDocument();
    }
    expect(fetchMock).toHaveBeenCalledTimes(requestsBeforeSearch);
  });

  it.each(states)("muestra %s en el detalle y conserva sus acciones existentes", async (status, label) => {
    currentBooking = booking(status);
    show(`/app/bookings/${currentBooking.id}`);
    expect(await screen.findByText(label, { selector: ".booking-detail-status" })).toBeInTheDocument();
    const has = (name: string, expected: boolean) => {
      if (expected) expect(screen.getByRole("button", { name })).toBeInTheDocument();
      else expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    };
    has("Editar borrador", status === "DRAFT");
    has("Pasar a pendiente", status === "DRAFT");
    has("Confirmar reserva", status === "PENDING");
    has("Cancelar reserva", ["DRAFT", "PENDING", "CONFIRMED"].includes(status));
    has("Gestionar pagos", ["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(status));
    expect(screen.queryByRole("button", { name: /check.in|check.out|marcar.*no show|finalizar reserva/i })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST"])("conserva las acciones de escritura para %s y cada estado permitido", async (role) => {
    context.role = role;
    for (const status of ["DRAFT", "PENDING", "CONFIRMED"] as const) {
      currentBooking = booking(status);
      show(`/app/bookings/${currentBooking.id}`);
      await screen.findByText(states.find(([value]) => value === status)![1], { selector: ".booking-detail-status" });
      expect(screen.getByRole("button", { name: "Cancelar reserva" })).toBeInTheDocument();
      if (status === "DRAFT") {
        expect(screen.getByRole("button", { name: "Editar borrador" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Pasar a pendiente" })).toBeInTheDocument();
      }
      if (status === "PENDING") expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
      cleanup();
      client.clear();
    }
  });

  it.each(states)("VIEWER consulta %s sin acciones mutables y conserva acceso de lectura a pagos", async (status, label) => {
    context.role = "VIEWER";
    currentBooking = booking(status);
    show(`/app/bookings/${currentBooking.id}`);
    expect(await screen.findByText(label, { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Editar borrador|Pasar a pendiente|Confirmar reserva|Cancelar reserva|Confirmar cancelación/ })).not.toBeInTheDocument();
    if (["CONFIRMED", "IN_PROGRESS", "COMPLETED"].includes(status)) {
      expect(screen.getByRole("button", { name: "Gestionar pagos" })).toBeInTheDocument();
    }
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it.each([null, "UNKNOWN"])("deniega acciones de escritura cuando el rol es %s", async (role) => {
    context.role = role;
    show(`/app/bookings/${currentBooking.id}`);
    await screen.findByText("Borrador", { selector: ".booking-detail-status" });
    expect(screen.queryByRole("button", { name: /Editar borrador|Pasar a pendiente|Cancelar reserva/ })).not.toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("hace un solo POST Submit ante clics síncronos y otro clic a los 450 ms", async () => {
    const respond = fetchMock.getMockImplementation()!;
    let release!: () => void;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    fetchMock.mockImplementation((input, init) => url(input).pathname.endsWith("/submit") ? pending.then(() => respond(input, init)) : respond(input, init));
    show(`/app/bookings/${currentBooking.id}`);
    const submit = await screen.findByRole("button", { name: "Pasar a pendiente" });
    act(() => { submit.click(); submit.click(); });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    submit.click();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
    release();
    await screen.findByText("Pendiente", { selector: ".booking-detail-status" });
  });

  it("bloquea Cancel y Submit simultáneos y permite reintentar Cancel tras un error", async () => {
    const user = userEvent.setup();
    const respond = fetchMock.getMockImplementation()!;
    let rejectCancellation!: () => void;
    const pending = new Promise<Response>((resolve) => {
      rejectCancellation = () => resolve(new Response(JSON.stringify({ message: "No se pudo cancelar." }), { status: 409, headers: { "Content-Type": "application/json" } }));
    });
    let firstCancellation = true;
    fetchMock.mockImplementation((input, init) => {
      if (url(input).pathname.endsWith("/cancel") && firstCancellation) { firstCancellation = false; return pending; }
      return respond(input, init);
    });
    show(`/app/bookings/${currentBooking.id}`);
    await user.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
    const cancel = screen.getByRole("button", { name: "Confirmar cancelación" });
    const submit = screen.getByRole("button", { name: "Pasar a pendiente" });
    act(() => { cancel.click(); cancel.click(); submit.click(); });
    await waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1));
    expect(url(fetchMock.mock.calls.find(([, init]) => init?.method === "POST")![0]).pathname).toMatch(/\/cancel$/);
    rejectCancellation();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cancelar.");
    await user.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
    await screen.findByText("Cancelada", { selector: ".booking-detail-status" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });

  it("Pasar a pendiente conserva POST submit y el evento BOOKING_SUBMITTED", async () => {
    const user = userEvent.setup();
    show(`/app/bookings/${currentBooking.id}`);
    await user.click(await screen.findByRole("button", { name: "Pasar a pendiente" }));
    expect(await screen.findByText("Pendiente", { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(await screen.findByText("Reserva pasó a pendiente")).toBeInTheDocument();
    const writes = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(writes).toHaveLength(1);
    expect(url(writes[0][0]).pathname).toMatch(/\/businesses\/business-1\/bookings\/draft-booking\/submit$/);
    expect(timeline[0].type).toBe("BOOKING_SUBMITTED");
    expect(screen.queryByRole("button", { name: "Pasar a pendiente" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeInTheDocument();
  });

  it("muestra los cuatro eventos contractuales con fecha, actor y motivo sin agregar historial", async () => {
    timeline = [
      { id: "created", type: "BOOKING_CREATED", occurredAt: "2026-09-30T12:00:00.000Z", actor: null, details: {} },
      { id: "submitted", type: "BOOKING_SUBMITTED", occurredAt: "2026-09-30T13:00:00.000Z", actor: { userId: "user-1" }, details: {} },
      { id: "confirmed", type: "BOOKING_CONFIRMED", occurredAt: "2026-09-30T14:00:00.000Z", actor: { userId: "user-1" }, details: {} },
      { id: "cancelled", type: "BOOKING_CANCELLED", occurredAt: "2026-09-30T15:00:00.000Z", actor: { userId: "user-1" }, details: { reason: "Cambio de fechas" } },
    ];
    const originalEvents = structuredClone(timeline);
    show("/timeline");
    await screen.findByText("Reserva pasó a pendiente");
    const rows = screen.getAllByRole("listitem");
    expect(rows).toHaveLength(4);
    for (const [index, label] of ["Reserva creada", "Reserva pasó a pendiente", "Reserva confirmada", "Reserva cancelada"].entries()) {
      expect(within(rows[index]).getByText(label)).toBeInTheDocument();
      expect(rows[index].querySelector("time")).toHaveAttribute("datetime", originalEvents[index].occurredAt);
    }
    expect(screen.getByText("Motivo: Cambio de fechas")).toBeInTheDocument();
    expect(screen.getAllByText("Acción realizada por un usuario")).toHaveLength(3);
    expect(timeline).toEqual(originalEvents);
    expect(fetchMock.mock.calls.every(([, init]) => !init?.method || init.method === "GET")).toBe(true);
  });

  it("conserva el borrador y su historial cuando backend rechaza Submit", async () => {
    const user = userEvent.setup();
    show(`/app/bookings/${currentBooking.id}`);
    const submit = await screen.findByRole("button", { name: "Pasar a pendiente" });
    await screen.findByText("Todavía no hay eventos registrados.");
    fetchMock.mockImplementationOnce(async () => new Response(JSON.stringify({ message: "Existe un conflicto de disponibilidad." }), { status: 409, headers: { "Content-Type": "application/json" } }));
    await user.click(submit);
    expect(await screen.findByRole("alert")).toHaveTextContent("Existe un conflicto de disponibilidad.");
    expect(screen.getByText("Borrador", { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pasar a pendiente" })).toBeEnabled();
    expect(screen.queryByText("Reserva pasó a pendiente")).not.toBeInTheDocument();
    expect(timeline).toEqual([]);
    expect(currentBooking.status).toBe("DRAFT");
    await user.click(screen.getByRole("button", { name: "Pasar a pendiente" }));
    expect(await screen.findByText("Pendiente", { selector: ".booking-detail-status" })).toBeInTheDocument();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(2);
  });
});
