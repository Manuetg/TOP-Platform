import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Booking, BookingStatus } from "../../bookings/types/booking.types";
import { PaymentHubPage } from "./PaymentHubPage";

const state = vi.hoisted(() => ({ bookings: [] as Booking[], navigate: vi.fn() }));

vi.mock("react-router-dom", () => ({ useNavigate: () => state.navigate }));
vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({ session: { accessToken: "synthetic-token" } }),
}));
vi.mock("../../business/context/BusinessContext", () => ({
  useBusinessContext: () => ({ activeBusinessId: "business-1" }),
}));
vi.mock("../../bookings/queries/use-bookings", () => ({
  useBookings: () => ({ data: state.bookings, isLoading: false, isError: false }),
}));
vi.mock("../../contacts/queries/use-contacts", () => ({
  useContacts: () => ({
    data: [
      { id: "contact-CONFIRMED", fullName: "Adriana Duarte" },
      { id: "contact-IN_PROGRESS", fullName: "Luis Gomez" },
      { id: "contact-COMPLETED", fullName: "Marta Ruiz" },
      { id: "contact-DRAFT", fullName: "Contacto borrador" },
      { id: "contact-PENDING", fullName: "Contacto pendiente" },
      { id: "contact-CANCELLED", fullName: "Contacto cancelado" },
      { id: "contact-NO_SHOW", fullName: "Contacto no show" },
    ],
    isLoading: false,
    isError: false,
  }),
}));

function booking(status: BookingStatus): Booking {
  return {
    id: `booking-${status.toLowerCase()}`,
    businessId: "business-1",
    status,
    contactId: `contact-${status}`,
    resourceIds: ["resource-1"],
    checkInDate: "2026-09-20",
    checkOutDate: "2026-09-22",
    adults: 2,
    children: 0,
    notes: null,
    createdAt: "2026-09-01T12:00:00Z",
    updatedAt: "2026-09-01T12:00:00Z",
  };
}

describe("etiquetas de reservas en el listado de pagos", () => {
  it.each([0, 400000])("incluye la Pendiente con precio %s junto a confirmadas, sin incluir Pendientes históricas sin precio", async (total) => {
    const pending = state.bookings.find((item) => item.status === "PENDING")!;
    pending.financialSummary = { totalAmountMinor: total, paidAmountMinor: 0, currency: "PYG" };
    state.bookings.push({ ...booking("PENDING"), id: "pending-legacy", contactId: null, financialSummary: { totalAmountMinor: null, paidAmountMinor: 0, currency: null } });
    const user = userEvent.setup();
    render(<PaymentHubPage />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    const row = screen.getByRole("button", { name: /Contacto pendiente/ });
    expect(within(row).getByText("Pendiente")).toHaveClass("payments-status--pending");
    await user.click(row);
    expect(state.navigate).toHaveBeenCalledWith("/app/bookings/booking-pending/payments");
    await user.type(screen.getByRole("searchbox"), "Pendiente");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  afterEach(() => vi.unstubAllGlobals());

  beforeEach(() => {
    vi.clearAllMocks();
    state.bookings = ([
      "DRAFT", "PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW",
    ] as BookingStatus[]).map(booking);
  });

  it("conserva los tres estados elegibles, sus clases y el enlace a cada cuenta", async () => {
    const user = userEvent.setup();
    render(<PaymentHubPage />);

    expect(screen.getAllByRole("button")).toHaveLength(3);
    for (const name of ["Contacto borrador", "Contacto pendiente", "Contacto cancelado", "Contacto no show"]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }

    const rows = [
      { guest: "Adriana Duarte", label: "Confirmada", status: "confirmed" },
      { guest: "Luis Gomez", label: "En curso", status: "in_progress" },
      { guest: "Marta Ruiz", label: "Finalizada", status: "completed" },
    ];
    for (const { guest, label, status } of rows) {
      const row = screen.getByRole("button", { name: new RegExp(guest) });
      expect(within(row).getByText(label)).toHaveClass(`payments-status--${status}`);
      await user.click(row);
      expect(state.navigate).toHaveBeenLastCalledWith(`/app/bookings/booking-${status}/payments`);
    }
  });

  it("mantiene la búsqueda por huésped y por identificador de una reserva finalizada", async () => {
    const user = userEvent.setup();
    render(<PaymentHubPage />);
    const search = screen.getByRole("searchbox");

    await user.type(search, " LUIS ");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Luis Gomez/ })).toHaveTextContent("En curso");

    await user.clear(search);
    await user.type(search, "BOOKING-COMPLETED");
    const completed = screen.getByRole("button", { name: /Marta Ruiz/ });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(completed).toHaveTextContent("Finalizada");
    await user.click(completed);
    expect(state.navigate).toHaveBeenLastCalledWith("/app/bookings/booking-completed/payments");
  });

  it.each([
    ["Confirmada", "Adriana Duarte", "confirmed"],
    ["En curso", "Luis Gomez", "in_progress"],
    ["Finalizada", "Marta Ruiz", "completed"],
  ])("busca por la etiqueta visible %s sin ampliar los estados elegibles", async (label, guest, status) => {
    const user = userEvent.setup();
    render(<PaymentHubPage />);
    await user.type(screen.getByRole("searchbox"), label);

    expect(screen.getAllByRole("button")).toHaveLength(1);
    const row = screen.getByRole("button", { name: new RegExp(guest) });
    expect(within(row).getByText(label)).toHaveClass(`payments-status--${status}`);
    await user.click(row);
    expect(state.navigate).toHaveBeenLastCalledWith(`/app/bookings/booking-${status}/payments`);
  });

  it.each([
    { description: "sin reservas", bookings: [] as Booking[] },
    { description: "con reservas no elegibles", bookings: (["DRAFT", "PENDING", "CANCELLED", "NO_SHOW"] as BookingStatus[]).map(booking) },
  ])("muestra ausencia real de reservas elegibles $description aunque haya una búsqueda", async ({ bookings }) => {
    state.bookings = bookings;
    const user = userEvent.setup();
    render(<PaymentHubPage />);

    expect(screen.getByRole("status")).toHaveTextContent("Sin reservas para cobrar");
    await user.type(screen.getByRole("searchbox"), "Adriana");
    expect(screen.getByRole("status")).toHaveTextContent("Sin reservas para cobrar");
    expect(screen.queryByText("Sin coincidencias")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Limpiar búsqueda" })).not.toBeInTheDocument();
  });

  it("distingue sin coincidencias y recupera las filas al limpiar con teclado, sin nuevas solicitudes", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<PaymentHubPage />);
    const search = screen.getByRole("searchbox", { name: "Buscar por huésped, reserva o estado" });

    await user.type(search, "huésped inexistente");
    expect(screen.getByRole("status")).toHaveTextContent("Sin coincidencias");
    expect(screen.queryByText("Sin reservas para cobrar")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Adriana Duarte/ })).not.toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole("button", { name: "Limpiar búsqueda" })).toHaveFocus();
    await user.keyboard("{Enter}");

    expect(search).toHaveValue("");
    expect(search).toHaveFocus();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(3);
    expect(screen.getByRole("button", { name: /Adriana Duarte/ })).toHaveTextContent("Confirmada");
    expect(screen.getByRole("button", { name: /Luis Gomez/ })).toHaveTextContent("En curso");
    expect(screen.getByRole("button", { name: /Marta Ruiz/ })).toHaveTextContent("Finalizada");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(state.navigate).not.toHaveBeenCalled();
  });
});
