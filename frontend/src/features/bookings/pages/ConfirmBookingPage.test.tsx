import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfirmBookingPage } from "./ConfirmBookingPage";

const state = vi.hoisted(() => ({ business: "business-1", businessStatus: "ACTIVE", role: "RECEPTIONIST", resource: "resource-1", resourceStatus: "ACTIVE", data: [{ id: "plan-1", name: "Normal", currency: "PYG", baseNightlyAmountMinor: 100000 }], error: false, loading: false, calculate: vi.fn(), confirm: vi.fn(), retry: vi.fn() }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: () => ({ status: "authenticated", session: { user: { id: "user-1" }, accessToken: "token" } }) }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ status: "ready", activeBusinessId: state.business, activeBusiness: { id: state.business, status: state.businessStatus, currency: "PYG" }, activeRole: state.role }) }));
vi.mock("../queries/use-booking", () => ({ useBooking: () => ({ data: { id: "booking-1", businessId: state.business, status: "PENDING", resourceIds: [state.resource], checkInDate: "2026-09-24", checkOutDate: "2026-09-26" }, isLoading: false, isError: false }) }));
vi.mock("../../resources/queries/use-resources", () => ({ useResources: () => ({ data: [{ id: state.resource, businessId: state.business, name: "Cabaña", status: state.resourceStatus }], isLoading: false, isError: false }) }));
vi.mock("../../pricing/queries/use-selectable-rate-plans", () => ({ useSelectableRatePlans: () => ({ data: state.data, isLoading: state.loading, isFetching: state.loading, isSuccess: !state.error && !state.loading, isError: state.error, refetch: state.retry }) }));
vi.mock("../../pricing/queries/use-calculate-price", () => ({ useCalculatePrice: () => ({ mutateAsync: state.calculate, isPending: false }) }));
vi.mock("../queries/use-confirm-booking", () => ({ useConfirmBooking: () => ({ mutateAsync: state.confirm, isPending: false }) }));
const view = () => <MemoryRouter initialEntries={["/app/bookings/booking-1/confirm"]}><Routes><Route path="/app/bookings/:bookingId/confirm" element={<ConfirmBookingPage />} /><Route path="/app/bookings/:bookingId" element={<h1>Detalle de reserva</h1>} /></Routes></MemoryRouter>;
describe("confirmación con selección contextual", () => {
  beforeEach(() => { vi.clearAllMocks(); state.role = "RECEPTIONIST"; state.business = "business-1"; state.businessStatus = "ACTIVE"; state.resource = "resource-1"; state.resourceStatus = "ACTIVE"; state.loading = false; state.error = false; state.data = [{ id: "plan-1", name: "Normal", currency: "PYG", baseNightlyAmountMinor: 100000 }]; });
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
    expect(screen.getByText(/No hay un tarifario disponible/)).toBeVisible(); expect(screen.getByRole("alert")).toBeVisible();
  });
  it.each(["business", "resource"] as const)("descarta una respuesta tardía al cambiar %s", async (field) => {
    const user = userEvent.setup(); let resolve!: (value: unknown) => void; state.calculate.mockReturnValue(new Promise((done) => { resolve = done; }));
    const page = render(view()); await user.click(screen.getByRole("button", { name: "Calcular precio" })); const signal = state.calculate.mock.calls[0][0].signal;
    state[field] = "other"; page.rerender(view()); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ nights: 2, totalAmountMinor: 200000, currency: "PYG" }));
    expect(screen.queryByText("Total calculado")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });
  it.each(["OWNER", "ADMIN"])("confirma precio manual con motivo obligatorio para %s", async (role) => {
    state.role = role; state.data = []; const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    const input = screen.getByLabelText("Precio final");
    expect(screen.getByText("₲")).toBeVisible();
    expect(input).toHaveAccessibleDescription(/guaraníes \(PYG\)/);
    await user.type(input, "450.000");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] });
    expect(state.calculate).not.toHaveBeenCalled();
  });
  it.each([1, 2])("confirma Manual con %s tarifario(s) sin referencia ni cálculo", async (count) => {
    state.role = "OWNER";
    state.data = Array.from({ length: count }, (_, index) => ({ id: `plan-${index + 1}`, name: `Tarifa ${index + 1}`, currency: "PYG", baseNightlyAmountMinor: 100000 }));
    const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("combobox", { name: "Plan tarifario" })).not.toBeInTheDocument();
    expect(screen.queryByText("Plan de referencia")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Precio final"), "450.000");
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] });
    expect(state.calculate).not.toHaveBeenCalled();
  });
  it("evita doble confirmación Manual mientras la primera solicitud sigue pendiente", async () => {
    state.role = "OWNER";
    let resolve!: () => void;
    state.confirm.mockReturnValue(new Promise<void>((done) => { resolve = done; }));
    const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Precio final"), "450000");
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.dblClick(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    await act(async () => resolve());
  });
  it.each(["pendiente", "fallida"])('permite Manual con consulta de tarifarios %s', async (status) => {
    state.role = "ADMIN"; state.data = []; state.loading = status === "pendiente"; state.error = status === "fallida";
    const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Precio final"), "450000");
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    expect(state.confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] });
  });
  it("rechaza vacío, negativos, decimales y overflow sin convertirlos; acepta cero", async () => {
    state.role = "OWNER"; const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    const input = screen.getByLabelText("Precio final");
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    for (const value of ["-1", "1,5", "1.5", "9007199254740992"]) {
      await user.clear(input); await user.type(input, value);
      expect(input).toHaveValue(value);
      expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    }
    await user.clear(input); await user.type(input, "0");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 0, overrideReason: "Acuerdo directo" }] });
  });
  it("mantiene Configurada y no mezcla su cálculo con Manual al alternar", async () => {
    state.role = "OWNER"; state.calculate.mockResolvedValue({ nights: 2, totalAmountMinor: 200000, currency: "PYG" });
    const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Calcular precio" }));
    expect(await screen.findByText("Total calculado")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.queryByText("Total calculado")).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Precio final"), "450000");
    await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(screen.getByRole("button", { name: "Configurada" }));
    expect(screen.queryByLabelText("Precio final")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Calcular precio" }));
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", ratePlanId: "plan-1" }] });
  });
  it("conserva el precio manual cuando aparecen planes", async () => {
    state.role = "OWNER"; state.data = []; const user = userEvent.setup(); const page = render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Precio final"), "500"); await user.type(screen.getByLabelText("Motivo del precio manual"), "Acuerdo");
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    state.data = [{ id: "new-plan", name: "Nueva tarifa", currency: "PYG", baseNightlyAmountMinor: 200 }]; page.rerender(view());
    expect(screen.getByLabelText("Motivo del precio manual")).toHaveValue("Acuerdo"); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeEnabled();
    expect(screen.getByLabelText("Precio final")).toHaveValue("500");
    await user.click(screen.getByRole("button", { name: "Confirmar reserva" }));
    expect(state.confirm).toHaveBeenCalledWith({ signal: expect.any(AbortSignal), pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 500, overrideReason: "Acuerdo" }] });
  });
  it("no habilita el precio manual sin plan a RECEPTIONIST", () => {
    state.data = []; render(view()); expect(screen.queryByLabelText("Precio final")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });
  it("bloquea la URL directa de confirmación a VIEWER", () => {
    state.role = "VIEWER"; render(view());
    expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso para confirmar");
    expect(screen.queryByRole("button", { name: "Confirmar reserva" })).not.toBeInTheDocument();
    expect(state.confirm).not.toHaveBeenCalled(); expect(state.calculate).not.toHaveBeenCalled();
  });
  it.each(["businessStatus", "resourceStatus"] as const)("bloquea Manual si %s deja de estar activo", async (field) => {
    state.role = "OWNER"; state[field] = "ARCHIVED";
    const user = userEvent.setup(); render(view());
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.getByRole("alert")).toHaveTextContent("No se pudo validar el negocio y alojamiento");
    expect(screen.getByLabelText("Precio final")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Confirmar reserva" })).toBeDisabled();
  });

});
