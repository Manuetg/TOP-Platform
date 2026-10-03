import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, BookingStatus } from "../types/booking.types";
import { BookingListPage } from "./BookingListPage";

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: "access-token", user: { id: "user-1" } } }),
}));
const context = vi.hoisted(() => ({ activeBusinessId: "business-1", activeRole: "OWNER" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => context }));

const states: [BookingStatus, string][] = [
  ["DRAFT", "Borrador"], ["PENDING", "Pendiente"], ["CONFIRMED", "Confirmada"],
  ["IN_PROGRESS", "En curso"], ["COMPLETED", "Finalizada"], ["CANCELLED", "Cancelada"], ["NO_SHOW", "No show"],
];
const bookings: Booking[] = states.map(([status]) => ({
  id: `${status.toLowerCase()}-booking`, businessId: "business-1", status, contactId: "contact-1", resourceIds: ["resource-1"],
  checkInDate: "2026-10-01", checkOutDate: "2026-10-03", adults: 2, children: 0, notes: null,
  createdAt: "2026-09-30T12:00:00.000Z", updatedAt: "2026-09-30T12:00:00.000Z",
}));
const fetchMock = vi.fn<typeof fetch>();
let client: QueryClient;
function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
function url(input: RequestInfo | URL) {
  return new URL(input instanceof Request ? input.url : String(input), window.location.origin);
}
function deferred() {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((finish) => { resolve = finish; });
  return { promise, resolve };
}
function CalendarDestination() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><h1>Calendario de prueba</h1><output aria-label="Ruta actual">{location.pathname}{location.search}</output><button onClick={() => void navigate(-1)}>Volver</button></>;
}
function show() {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/bookings"]}><Routes><Route path="/app/bookings" element={<BookingListPage />} /><Route path="/app/calendar" element={<CalendarDestination />} /></Routes></MemoryRouter></QueryClientProvider>);
}
function assertNoEmptyMessage() {
  expect(screen.queryByRole("heading", { name: /No encontramos reservas|Todavía no hay reservas/ })).not.toBeInTheDocument();
}
async function loaded() {
  await waitFor(() => expect(screen.getAllByRole("button", { name: /^Abrir reserva / })).toHaveLength(14));
}

beforeEach(() => {
  Object.assign(context, { activeBusinessId: "business-1", activeRole: "OWNER" });
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (input) => {
    const request = url(input);
    if (request.pathname.endsWith("/contacts")) return json([{ id: "contact-1", fullName: "Ana Pérez" }]);
    if (request.pathname.endsWith("/resources")) return json([{ id: "resource-1", name: "Cabaña Lapacho" }]);
    if (request.pathname.endsWith("/bookings")) return json(bookings.filter((booking) => !request.searchParams.get("status") || booking.status === request.searchParams.get("status")));
    throw new Error(`Request inesperado: ${request.pathname}`);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => { cleanup(); client?.clear(); vi.unstubAllGlobals(); });

describe("BookingListPage: foco durante consultas de filtros", () => {
  it.each(["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"])("conserva Crear reserva para %s y navega a Calendario; Back recupera el listado", async (role) => {
    context.activeRole = role;
    const user = userEvent.setup();
    show(); await loaded();
    await user.click(screen.getByRole("button", { name: "Crear reserva" }));
    expect(screen.getByRole("heading", { name: "Calendario de prueba" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent(/^\/app\/calendar$/);
    expect(context.activeBusinessId).toBe("business-1");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("heading", { name: "Reservas", level: 1 })).toBeInTheDocument();
    await loaded();
  });

  it("presenta estado operativo, estado financiero y porcentaje en filas y tarjetas, sin solicitudes por cada reserva", async () => {
    const sourceFetch = fetchMock.getMockImplementation()!;
    const summaries: Record<string, { totalAmountMinor: number | null; paidAmountMinor: number; currency: string | null } | undefined> = {
      DRAFT: undefined,
      PENDING: { totalAmountMinor: 400000, paidAmountMinor: 0, currency: "PYG" },
      CONFIRMED: { totalAmountMinor: 400000, paidAmountMinor: 1, currency: "PYG" },
      IN_PROGRESS: { totalAmountMinor: 3, paidAmountMinor: 1, currency: "PYG" },
      COMPLETED: { totalAmountMinor: 3, paidAmountMinor: 3, currency: "PYG" },
      CANCELLED: { totalAmountMinor: 0, paidAmountMinor: 0, currency: "PYG" },
      NO_SHOW: { totalAmountMinor: null, paidAmountMinor: 0, currency: null },
    };
    fetchMock.mockImplementation((input, init) => url(input).pathname.endsWith("/bookings")
      ? Promise.resolve(json(bookings.map((item) => ({ ...item, financialSummary: summaries[item.status] }))))
      : sourceFetch(input, init));
    show(); await loaded();
    for (const [status, label, financial, percentage] of [
      ["DRAFT", "Borrador", "Sin precio", "—"],
      ["PENDING", "Pendiente", "Sin pagos", "0%"],
      ["CONFIRMED", "Confirmada", "Pago parcial", "<0,01%"],
      ["IN_PROGRESS", "En curso", "Pago parcial", "33,33%"],
      ["COMPLETED", "Finalizada", "Pagada", "100%"],
      ["CANCELLED", "Cancelada", "Sin pagos", "—"],
      ["NO_SHOW", "No show", "Sin precio", "—"],
    ]) {
      const id = `${status.toLowerCase()}-booking`.slice(0, 8).toUpperCase();
      for (const row of screen.getAllByRole("button", { name: `Abrir reserva ${id}` })) {
        expect(within(row).getByText(label)).toBeInTheDocument();
        expect(within(row).getByText(financial)).toBeInTheDocument();
        expect(within(row).getByText(percentage)).toBeInTheDocument();
      }
    }
    expect(fetchMock.mock.calls).toHaveLength(3);
    const user = userEvent.setup();
    await user.type(screen.getByRole("searchbox", { name: "Buscar reservas" }), "Pago parcial");
    expect(screen.getAllByRole("button", { name: /^Abrir reserva / })).toHaveLength(4);
    expect(fetchMock.mock.calls).toHaveLength(3);
  });

  it.each(states)("mantiene foco y controles antes y después del GET diferido de %s", async (status, label) => {
    const user = userEvent.setup();
    const originalFetch = fetchMock.getMockImplementation()!;
    const pending = deferred();
    fetchMock.mockImplementation((input, init) => url(input).searchParams.get("status") === status ? pending.promise : originalFetch(input, init));
    show(); await loaded();
    await user.click(screen.getByRole("button", { name: /Buscar o filtrar reservas/ }));
    const filter = screen.getByRole("combobox", { name: "Estado" });
    const heading = screen.getByRole("heading", { name: "Reservas", level: 1 });
    const search = screen.getByRole("searchbox", { name: "Buscar reservas" });
    expect(within(filter).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent?.trim()])).toEqual([["ALL", "Todos"], ...states]);
    filter.focus(); await user.selectOptions(filter, status);
    await waitFor(() => expect(fetchMock.mock.calls.some(([input]) => url(input).searchParams.get("status") === status)).toBe(true));
    expect(screen.getByRole("combobox", { name: "Estado" })).toBe(filter);
    expect(filter).toHaveFocus();
    expect(filter).toHaveValue(status);
    expect(screen.getByRole("heading", { name: "Reservas", level: 1 })).toBe(heading);
    expect(screen.getByRole("searchbox", { name: "Buscar reservas" })).toBe(search);
    expect(screen.getByRole("button", { name: "Crear reserva" })).toBeEnabled();
    expect(screen.getByRole("region", { name: "Resultados de reservas" })).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reservas");
    expect(screen.queryAllByRole("button", { name: /^Abrir reserva / })).toHaveLength(0);
    assertNoEmptyMessage();
    await act(async () => { pending.resolve(json(bookings.filter((booking) => booking.status === status))); await pending.promise; });
    await waitFor(() => expect(screen.getAllByRole("button", { name: /^Abrir reserva / })).toHaveLength(2));
    expect(screen.getByRole("combobox", { name: "Estado" })).toBe(filter);
    expect(filter).toHaveFocus();
    expect(screen.getByRole("region", { name: "Resultados de reservas" })).toHaveAttribute("aria-busy", "false");
    for (const row of screen.getAllByRole("button", { name: /^Abrir reserva / })) expect(within(row).getByText(label)).toBeInTheDocument();
    assertNoEmptyMessage();
  });

  it("monta encabezado y filtros en carga inicial y muestra vacío solo al completar la consulta", async () => {
    const originalFetch = fetchMock.getMockImplementation()!;
    const pending = deferred();
    fetchMock.mockImplementation((input, init) => url(input).pathname.endsWith("/bookings") ? pending.promise : originalFetch(input, init));
    show();
    expect(screen.getByRole("heading", { name: "Reservas", level: 1 })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reservas");
    assertNoEmptyMessage();
    await act(async () => { pending.resolve(json([])); await pending.promise; });
    expect(await screen.findByRole("heading", { name: "Todavía no hay reservas" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Resultados de reservas" })).toHaveAttribute("aria-busy", "false");
  });

  it("conserva el foco y filtros tras un error y permite consultar otro estado sin remontarlos", async () => {
    const user = userEvent.setup();
    const originalFetch = fetchMock.getMockImplementation()!;
    const failed = deferred();
    const next = deferred();
    fetchMock.mockImplementation((input, init) => {
      const status = url(input).searchParams.get("status");
      if (status === "DRAFT") return failed.promise;
      if (status === "PENDING") return next.promise;
      return originalFetch(input, init);
    });
    show(); await loaded();
    await user.click(screen.getByRole("button", { name: /Buscar o filtrar reservas/ }));
    const filter = screen.getByRole("combobox", { name: "Estado" });
    filter.focus(); await user.selectOptions(filter, "DRAFT");
    await screen.findByRole("status");
    expect(filter).toHaveFocus(); assertNoEmptyMessage();
    await act(async () => { failed.resolve(json({ message: "No pudimos consultar este estado." }, 503)); await failed.promise; });
    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos cargar las reservas");
    expect(screen.getByRole("combobox", { name: "Estado" })).toBe(filter);
    expect(filter).toHaveFocus(); assertNoEmptyMessage();
    expect(screen.getByRole("heading", { name: "Reservas", level: 1 })).toBeInTheDocument();
    await user.selectOptions(filter, "PENDING");
    expect(await screen.findByRole("status")).toHaveTextContent("Cargando reservas");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(filter).toHaveFocus(); assertNoEmptyMessage();
    await act(async () => { next.resolve(json([])); await next.promise; });
    expect(await screen.findByRole("heading", { name: "No encontramos reservas" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado" })).toBe(filter);
    expect(filter).toHaveFocus();
    expect(filter).toHaveValue("PENDING");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
