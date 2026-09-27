import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmBookingPage } from "./ConfirmBookingPage";

const state = vi.hoisted(() => ({ business: "business-1", role: "RECEPTIONIST", resource: "resource-1", data: [{ id: "plan-1", name: "Normal", currency: "PYG", baseNightlyAmountMinor: 100000 }], error: false, loading: false, calculate: vi.fn(), confirm: vi.fn(), retry: vi.fn() }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ session: { user: { id: "user-1" }, accessToken: "token" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeBusinessId: state.business, activeRole: state.role }) }));
vi.mock("../queries/use-booking", () => ({ useBooking: () => ({ data: { id: "booking-1", status: "PENDING", resourceIds: [state.resource], checkInDate: "2026-09-24", checkOutDate: "2026-09-26" }, isLoading: false, isError: false }) }));
vi.mock("../../resources/queries/use-resources", () => ({ useResources: () => ({ data: [{ id: state.resource, name: "Cabaña" }], isLoading: false, isError: false }) }));
vi.mock("../../pricing/queries/use-selectable-rate-plans", () => ({ useSelectableRatePlans: () => ({ data: state.data, isLoading: state.loading, isFetching: state.loading, isSuccess: !state.error && !state.loading, isError: state.error, refetch: state.retry }) }));
vi.mock("../../pricing/queries/use-calculate-price", () => ({ useCalculatePrice: () => ({ mutateAsync: state.calculate, isPending: false }) }));
vi.mock("../queries/use-confirm-booking", () => ({ useConfirmBooking: () => ({ mutateAsync: state.confirm, isPending: false }) }));
const view = () => <MemoryRouter><ConfirmBookingPage /></MemoryRouter>;
describe("confirmación con selección contextual", () => {
  beforeEach(() => { vi.clearAllMocks(); state.role = "RECEPTIONIST"; state.business = "business-1"; state.resource = "resource-1"; state.loading = false; state.error = false; state.data = [{ id: "plan-1", name: "Normal", currency: "PYG", baseNightlyAmountMinor: 100000 }]; });
  it("presenta fechas y autoselecciona el único plan sin modificar ISO enviado", async () => {
    const user = userEvent.setup(); state.calculate.mockResolvedValue({ nights: 2, totalAmountMinor: 200000, currency: "PYG" }); render(view());
    expect(screen.getByText("24/09/2026 → 26/09/2026")).toBeVisible(); expect(screen.getByRole("combobox")).toHaveValue("plan-1");
    await user.click(screen.getByRole("button", { name: "Calcular precio" }));
    expect(state.calculate).toHaveBeenCalledWith({ resourceId: "resource-1", checkIn: "2026-09-24", checkOut: "2026-09-26", signal: expect.any(AbortSignal) });
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
  });
  it("bloquea cero planes y distingue error recuperable", async () => {
    const user = userEvent.setup(); state.data = []; const page = render(view());
    expect(screen.getByText(/No hay un tarifario disponible/)).toBeVisible(); expect(screen.getByRole("button", { name: "Calcular precio" })).toBeDisabled();
    state.error = true; page.rerender(view()); await user.click(screen.getByRole("button", { name: "Reintentar tarifarios" })); expect(state.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText(/No hay un tarifario disponible/)).not.toBeInTheDocument();
  });
  it.each(["business", "resource"] as const)("descarta una respuesta tardía al cambiar %s", async (field) => {
    const user = userEvent.setup(); let resolve!: (value: unknown) => void; state.calculate.mockReturnValue(new Promise((done) => { resolve = done; }));
    const page = render(view()); await user.click(screen.getByRole("button", { name: "Calcular precio" })); const signal = state.calculate.mock.calls[0][0].signal;
    state[field] = "other"; page.rerender(view()); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ nights: 2, totalAmountMinor: 200000, currency: "PYG" }));
    expect(screen.queryByText("Total calculado")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });
  it.each(["OWNER", "ADMIN"])("confirma sin tarifario con motivo obligatorio para %s", async (role) => {
    state.role = role; state.data = []; const user = userEvent.setup(); render(view());
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    await user.type(screen.getByLabelText("Precio final"), "450.000");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] });
    expect(state.calculate).not.toHaveBeenCalled();
  });
  it("descarta el precio excepcional cuando aparecen planes", async () => {
    state.role = "OWNER"; state.data = []; const user = userEvent.setup(); const page = render(view());
    await user.type(screen.getByLabelText("Precio final"), "500"); await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    state.data = [{ id: "new-plan", name: "Nueva tarifa", currency: "PYG", baseNightlyAmountMinor: 200 }]; page.rerender(view());
    expect(screen.queryByLabelText("Motivo del precio manual")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    state.data = []; page.rerender(view()); expect(screen.getByLabelText("Precio final")).toHaveValue("");
  });
  it.each(["RECEPTIONIST", "VIEWER"])("no habilita el precio manual sin plan a %s", (role) => {
    state.role = role; state.data = []; render(view()); expect(screen.queryByLabelText("Precio final")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });

});
