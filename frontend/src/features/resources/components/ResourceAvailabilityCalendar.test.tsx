import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import type { Booking } from "../../bookings/types/booking.types";
import type { Block } from "../../blocks/types/block.types";
import { ResourceAvailabilityCalendar } from "./ResourceAvailabilityCalendar";

const useBookingsMock = vi.fn();
const useBlocksMock = vi.fn();
const bookingsRefetch = vi.fn();
const blocksRefetch = vi.fn();

vi.mock("../../bookings/queries/use-bookings", () => ({ useBookings: (...args: unknown[]) => useBookingsMock(...args) }));
vi.mock("../../blocks/queries/use-blocks", () => ({ useBlocks: (...args: unknown[]) => useBlocksMock(...args) }));

function booking(overrides: Partial<Booking> = {}): Booking {
  return {
    id: "booking-1", businessId: "business-1", resourceIds: ["resource-1"],
    status: "CONFIRMED", checkInDate: "2026-09-10", checkOutDate: "2026-09-12",
    contactId: null, adults: 2, children: 0, notes: null,
    createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function block(overrides: Partial<Block> = {}): Block {
  return {
    id: "block-1", businessId: "business-1", resourceId: "resource-1", type: "MAINTENANCE",
    reason: "Mantenimiento", notes: null, startsAt: "2026-09-18T12:00:00.000Z", endsAt: "2026-09-19T12:00:00.000Z",
    status: "SCHEDULED", effectiveStatus: "SCHEDULED", cancellationReason: null, cancelledAt: null,
    createdAt: "2026-09-01T12:00:00.000Z", updatedAt: "2026-09-01T12:00:00.000Z",
    ...overrides,
  };
}

function CurrentLocation() {
  return <span aria-label="Ruta actual">{useLocation().pathname}</span>;
}

const props = { businessId: "business-1", resourceId: "resource-1", resourceName: "Cabaña del bosque", timezone: "America/Asuncion", accessToken: "token-1" };

function renderCalendar(overrides: Partial<typeof props> = {}) {
  return render(<MemoryRouter><ResourceAvailabilityCalendar {...props} {...overrides} /><CurrentLocation /></MemoryRouter>);
}

function dayAgenda(day = "10/09/2026") {
  return screen.getByRole("region", { name: `Movimientos del ${day}` });
}

describe("ResourceAvailabilityCalendar", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
    useBookingsMock.mockReset();
    useBlocksMock.mockReset();
    bookingsRefetch.mockReset().mockResolvedValue({});
    blocksRefetch.mockReset().mockResolvedValue({});
    useBookingsMock.mockReturnValue({ data: [booking()], isLoading: false, isError: false, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: [block()], isLoading: false, isError: false, refetch: blocksRefetch });
  });

  afterEach(() => { vi.useRealTimers(); });

  it("shows the resource agenda and opens the existing booking destination", async () => {
    const user = userEvent.setup();
    renderCalendar();
    expect(screen.getByRole("heading", { name: "Agenda de reservas y bloqueos" })).toBeInTheDocument();
    expect(screen.getByText("Cabaña del bosque")).toBeInTheDocument();
    expect(within(dayAgenda()).getByText("Confirmada")).toBeInTheDocument();
    expect(useBookingsMock).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-1", resourceId: "resource-1", accessToken: "token-1" }));
    expect(useBlocksMock).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-1", resourceId: "resource-1" }));
    await user.click(screen.getByRole("link", { name: "Ver reserva booking-1" }));
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/app/bookings/booking-1");
  });

  it("exposes every movement and explicit status after selecting a dense day", async () => {
    const user = userEvent.setup();
    useBookingsMock.mockReturnValue({ data: [
      booking({ id: "draft", status: "DRAFT" }), booking({ id: "pending", status: "PENDING" }),
      booking({ id: "completed", status: "COMPLETED" }), booking({ id: "cancelled", status: "CANCELLED" }),
      booking({ id: "no-show", status: "NO_SHOW" }), booking({ id: "incomplete", status: "DRAFT", checkOutDate: null }),
    ], isLoading: false, isError: false, refetch: bookingsRefetch });
    const longReason = "Mantenimiento preventivo de la instalación y revisión completa de todos los equipos del alojamiento";
    useBlocksMock.mockReturnValue({ data: [block({ startsAt: "2026-09-10T12:00:00.000Z", reason: longReason, effectiveStatus: "FINISHED" })], isLoading: false, isError: false, refetch: blocksRefetch });
    renderCalendar();
    await user.click(screen.getByRole("button", { name: "10/09/2026, hoy: 4 movimientos" }));
    const agenda = within(dayAgenda());
    expect(agenda.getAllByRole("listitem")).toHaveLength(4);
    for (const label of ["Borrador", "Pendiente", "Finalizada", "Finalizado"]) expect(agenda.getByText(label)).toBeInTheDocument();
    expect(agenda.getByText(longReason)).toBeInTheDocument();
    expect(agenda.getAllByRole("link")).toHaveLength(3);
    expect(screen.queryByText(/ocupad|ocupación|disponible|libre/i)).not.toBeInTheDocument();
  });

  it("shows block dates in the business timezone without inventing a block detail route", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: "18/09/2026: 1 movimiento" }));
    const agenda = within(dayAgenda("18/09/2026"));
    expect(agenda.getByText("Mantenimiento")).toBeInTheDocument();
    expect(agenda.getByText("Programado")).toBeInTheDocument();
    expect(agenda.getByText("Inicio: 18/09/2026, 09:00 · Fin: 19/09/2026, 09:00")).toBeInTheDocument();
    expect(agenda.queryByRole("link")).not.toBeInTheDocument();
  });

  it("preserves exclusive checkout and block end boundaries", async () => {
    const user = userEvent.setup();
    useBookingsMock.mockReturnValue({ data: [booking({ checkOutDate: "2026-09-11" })], isLoading: false, isError: false, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: [block({ startsAt: "2026-09-10T00:00:00.000Z", endsAt: "2026-09-11T00:00:00.000Z" })], isLoading: false, isError: false, refetch: blocksRefetch });
    renderCalendar({ timezone: "UTC" });
    expect(screen.getByRole("button", { name: "10/09/2026, hoy: 2 movimientos" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "11/09/2026: 0 movimientos" }));
    expect(within(dayAgenda("11/09/2026")).getByText("Sin movimientos registrados para este día.")).toBeInTheDocument();
    expect(within(dayAgenda("11/09/2026")).queryByRole("listitem")).not.toBeInTheDocument();
  });

  it("keeps an empty agenda distinct from an availability result", () => {
    useBookingsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: blocksRefetch });
    renderCalendar();
    expect(screen.getByText("Sin movimientos en este mes.")).toBeInTheDocument();
    expect(screen.getByText("Sin movimientos registrados para este día.")).toBeInTheDocument();
    expect(screen.getByText(/la disponibilidad se valida en la consulta de disponibilidad/)).toBeInTheDocument();
    expect(screen.queryByText(/disponible|ocupad|libre/i)).not.toBeInTheDocument();
  });

  it("changes months and returns to the selected business-local today", async () => {
    const user = userEvent.setup();
    renderCalendar();
    await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(screen.getByText("octubre de 2026")).toBeInTheDocument();
    expect(dayAgenda("01/10/2026")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Hoy" }));
    expect(screen.getByText("septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "10/09/2026, hoy: 1 movimiento" })).toHaveAttribute("aria-pressed", "true");
  });

  it("uses arrows and week edges with one day in the tab order", async () => {
    const user = userEvent.setup();
    renderCalendar();
    const today = screen.getByRole("button", { name: "10/09/2026, hoy: 1 movimiento" });
    today.focus();
    await user.keyboard("{ArrowRight}{ArrowDown}");
    expect(screen.getByRole("button", { name: "18/09/2026: 1 movimiento" })).toHaveFocus();
    expect(dayAgenda("18/09/2026")).toBeInTheDocument();
    await user.keyboard("{Home}");
    expect(screen.getByRole("button", { name: "14/09/2026: 0 movimientos" })).toHaveFocus();
    await user.keyboard("{End}");
    const lastDay = screen.getByRole("button", { name: "20/09/2026: 0 movimientos" });
    expect(lastDay).toHaveFocus();
    expect(lastDay).toHaveAttribute("tabindex", "0");
    expect(today).toHaveAttribute("tabindex", "-1");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });

  it("loads the whole agenda before showing a summary or empty days", () => {
    useBlocksMock.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: blocksRefetch });
    renderCalendar();
    expect(screen.getByRole("status")).toHaveTextContent("Cargando reservas y bloqueos.");
    expect(screen.queryByRole("group", { name: /Días de/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Resumen del mes")).not.toBeInTheDocument();
  });

  it("retries both failed agenda sources once during repeated clicks and recovers", async () => {
    const user = userEvent.setup();
    let finishBookings!: () => void;
    let finishBlocks!: () => void;
    bookingsRefetch.mockReturnValue(new Promise<void>((resolve) => { finishBookings = resolve; }));
    blocksRefetch.mockReturnValue(new Promise<void>((resolve) => { finishBlocks = resolve; }));
    useBookingsMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: blocksRefetch });
    renderCalendar();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar la agenda de este recurso.");
    await user.dblClick(screen.getByRole("button", { name: "Reintentar" }));
    expect(bookingsRefetch).toHaveBeenCalledTimes(1);
    expect(blocksRefetch).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Reintentando" })).toBeDisabled();
    useBookingsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: blocksRefetch });
    await act(async () => { finishBookings(); finishBlocks(); });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("Sin movimientos en este mes.")).toBeInTheDocument();
  });

  it("resets period and selection after changing the business/resource context", async () => {
    const user = userEvent.setup();
    const { rerender } = renderCalendar();
    await user.click(screen.getByRole("button", { name: "Mes siguiente" }));
    useBookingsMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: bookingsRefetch });
    useBlocksMock.mockReturnValue({ data: [], isLoading: false, isError: false, refetch: blocksRefetch });
    rerender(<MemoryRouter><ResourceAvailabilityCalendar {...props} businessId="business-2" resourceId="resource-2" resourceName="Otro alojamiento" /><CurrentLocation /></MemoryRouter>);
    expect(screen.getByText("septiembre de 2026")).toBeInTheDocument();
    expect(dayAgenda()).toBeInTheDocument();
    expect(screen.getByText("Otro alojamiento")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ver reserva booking-1" })).not.toBeInTheDocument();
    expect(useBookingsMock).toHaveBeenLastCalledWith(expect.objectContaining({ businessId: "business-2", resourceId: "resource-2" }));
    expect(useBlocksMock).toHaveBeenLastCalledWith(expect.objectContaining({ businessId: "business-2", resourceId: "resource-2" }));
  });

  it("keeps the month boundary in the business timezone when UTC is already next month", () => {
    vi.setSystemTime(new Date("2026-10-01T01:00:00.000Z"));
    renderCalendar();
    expect(screen.getByText("septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "30/09/2026, hoy: 0 movimientos" })).toHaveAttribute("aria-current", "date");
    expect(useBlocksMock).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-09-01T03:00:00.000Z", to: "2026-10-01T03:00:00.000Z" }));
  });

  it("preserves business-local month instants across DST", () => {
    vi.setSystemTime(new Date("2026-03-08T15:00:00.000Z"));
    renderCalendar({ timezone: "America/New_York" });
    expect(screen.getByRole("button", { name: "08/03/2026, hoy: 0 movimientos" })).toHaveAttribute("aria-current", "date");
    expect(useBlocksMock).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2026-03-01T05:00:00.000Z", to: "2026-04-01T04:00:00.000Z" }));
  });

  it("includes leap day and excludes the next month's first day", () => {
    vi.setSystemTime(new Date("2028-02-29T12:00:00.000Z"));
    renderCalendar({ timezone: "UTC" });
    expect(screen.getByRole("button", { name: "29/02/2028, hoy: 0 movimientos" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("button", { name: /^01\/03\/2028/ })).not.toBeInTheDocument();
    expect(useBlocksMock).toHaveBeenLastCalledWith(expect.objectContaining({ from: "2028-02-01T00:00:00.000Z", to: "2028-03-01T00:00:00.000Z" }));
  });
});
