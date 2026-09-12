import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { useDashboard } from "../queries/use-dashboard";
import { useAuth } from "../../auth/context/AuthContext";
import { ApiError } from "../../../shared/api/api-client";
import type { DashboardResponse } from "../types/dashboard.types";

vi.mock("../queries/use-dashboard", () => ({ useDashboard: vi.fn() }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: vi.fn() }));
const query = vi.mocked(useDashboard);
const auth = vi.mocked(useAuth);
const retry = vi.fn();
const data: DashboardResponse = {
  occupancy: { occupiedResourceNights: 18, sellableResourceNights: 25, occupancyRateBasisPoints: 7200 },
  revenue: { currency: "PYG", amountMinor: 12500000 },
  reservations: { total: 8, byStatus: { DRAFT: 1, PENDING: 1, CONFIRMED: 2, IN_PROGRESS: 1, COMPLETED: 2, CANCELLED: 1, NO_SHOW: 0 } },
};
function show(businessId = "business-a") {
  return render(<MemoryRouter><DashboardPage businessId={businessId} /></MemoryRouter>);
}
function result(overrides = {}) {
  query.mockReturnValue({ data, isFetching: false, isError: false, refetch: retry, ...overrides } as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({ session: { accessToken: "access-token" } } as never);
  result();
});
describe("DashboardPage", () => {
  it("presents real KPI values, seven statuses and navigation", () => {
    show();
    expect(within(screen.getByRole("article", { name: "Ocupación" })).getByText("72%")).toBeVisible();
    expect(screen.getByText("₲ 12.500.000")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Reservas creadas" })).getByText("8")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
    for (const label of ["Borrador", "Pendiente", "Confirmada", "En curso", "Completada", "Cancelada", "No show"]) expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole("link", { name: "Ver reservas" })).toHaveAttribute("href", "/app/bookings");
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a", accessToken: "access-token" }));
  });
  it("formats the backend rate without recalculating from counts", () => {
    result({ data: { ...data, occupancy: { ...data.occupancy, occupancyRateBasisPoints: 7123 } } });
    show();
    expect(screen.getAllByText("71,23%")).toHaveLength(2);
  });
  it("shows empty metrics including null, not zero percent", () => {
    result({ data: { occupancy: { occupiedResourceNights: 0, sellableResourceNights: 0, occupancyRateBasisPoints: null }, revenue: { currency: "PYG", amountMinor: 0 }, reservations: { total: 0, byStatus: Object.fromEntries(Object.keys(data.reservations.byStatus).map((key) => [key, 0])) } } });
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Aún no hay actividad");
    expect(screen.getAllByText("Sin inventario vendible")).toHaveLength(2);
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText("₲ 0")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(7);
  });
  it("shows structural skeletons without stale metrics during fetching", () => {
    result({ isFetching: true });
    show();
    expect(screen.getByRole("status", { name: "Cargando resumen" })).toBeVisible();
    expect(screen.queryByText("₲ 12.500.000")).not.toBeInTheDocument();
  });
  it("shows global error and retries", async () => {
    result({ isError: true, error: new Error("network") });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar el resumen.");
    expect(screen.queryByText("72%")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each([[401, "Tu sesión ya no es válida"], [403, "No tienes permiso"]])("explains HTTP %s without exposing backend details", (status, message) => {
    result({ isError: true, error: new ApiError(status, "sensitive internal detail") });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(screen.queryByText("sensitive internal detail")).not.toBeInTheDocument();
  });
  it("does not apply draft dates until submit", async () => {
    show();
    const original = query.mock.lastCall?.[0];
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-09-01" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "2026-10-02" } });
    expect(query.mock.lastCall?.[0]).toEqual(original);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(query.mock.lastCall?.[0]).toEqual(expect.objectContaining({ from: "2026-09-01", to: "2026-10-02" }));
  });
  it.each([["", "2026-09-02"], ["2026-09-02", "2026-09-02"], ["2026-09-03", "2026-09-02"], ["2026-09-01", "2026-10-03"]])("rejects invalid period without refreshing", async (from, to) => {
    show();
    const original = query.mock.lastCall?.[0];
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: from } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: to } });
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    expect(screen.getByLabelText("Desde")).toHaveAttribute("aria-invalid", "true");
    expect(query.mock.lastCall?.[0]).toEqual(original);
    expect(retry).not.toHaveBeenCalled();
  });
  it("explains missing business configuration", () => { show(""); expect(screen.getByRole("status")).toHaveTextContent("VITE_DEV_BUSINESS_ID"); });
  it("offers login with no session", () => {
    auth.mockReturnValue({ session: null } as never);
    show();
    expect(screen.getByRole("link", { name: "Ir a iniciar sesión" })).toHaveAttribute("href", "/login");
  });
});
