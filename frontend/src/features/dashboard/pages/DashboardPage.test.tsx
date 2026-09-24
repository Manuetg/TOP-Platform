import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DashboardPage } from "./DashboardPage";
import { useDashboard } from "../queries/use-dashboard";
import { useAuth } from "../../auth/context/AuthContext";
import { ApiError } from "../../../shared/api/api-client";
import { useResources } from "../../resources/queries/use-resources";
import { useResourceImageCovers } from "../../resources/queries/use-resource-image-covers";
import { useRatePlans } from "../../pricing/queries/use-rate-plans";
import type { DashboardResponse } from "../types/dashboard.types";

vi.mock("../queries/use-dashboard", () => ({ useDashboard: vi.fn() }));
vi.mock("../../auth/context/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("../../resources/queries/use-resources", () => ({
  useResources: vi.fn(),
}));
vi.mock("../../resources/queries/use-resource-image-covers", () => ({
  useResourceImageCovers: vi.fn(),
}));
vi.mock("../../pricing/queries/use-rate-plans", () => ({
  useRatePlans: vi.fn(),
}));
const query = vi.mocked(useDashboard);
const auth = vi.mocked(useAuth);
const retry = vi.fn();
const data: DashboardResponse = {
  occupancy: {
    occupiedResourceNights: 18,
    sellableResourceNights: 25,
    occupancyRateBasisPoints: 7200,
    daily: [
      { date: "2026-09-01", occupiedResourceNights: 1, sellableResourceNights: 2, availableResourceNights: 1, occupancyRateBasisPoints: 5000 },
      { date: "2026-09-02", occupiedResourceNights: 2, sellableResourceNights: 2, availableResourceNights: 0, occupancyRateBasisPoints: 10000 },
    ],
    weekends: { total: 2, full: 1, partial: 0, available: 1, items: [{ from: "2026-09-05", to: "2026-09-07", totalResources: 2, availableResources: 2, status: "AVAILABLE" }] },
  },
  revenue: { currency: "PYG", amountMinor: 12500000 },
  reservations: {
    total: 8,
    byStatus: {
      DRAFT: 1,
      PENDING: 1,
      CONFIRMED: 2,
      IN_PROGRESS: 1,
      COMPLETED: 2,
      CANCELLED: 1,
      NO_SHOW: 0,
    },
  },
};
function show(businessId = "business-a") {
  return render(
    <MemoryRouter>
      <DashboardPage businessId={businessId} />
    </MemoryRouter>,
  );
}
function result(overrides = {}) {
  query.mockReturnValue({
    data,
    isFetching: false,
    isError: false,
    refetch: retry,
    ...overrides,
  } as never);
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockReturnValue({ session: { accessToken: "access-token" } } as never);
  vi.mocked(useResources).mockReturnValue({
    data: [
      {
        id: "r1",
        name: "Recurso real",
        internalCode: "R1",
        status: "ACTIVE",
        capacityMaximum: 4,
      },
      {
        id: "r2",
        name: "Recurso archivado",
        internalCode: "R2",
        status: "ARCHIVED",
        capacityMaximum: 2,
      },
    ],
    isLoading: false,
    isError: false,
    refetch: retry,
  } as never);
  vi.mocked(useResourceImageCovers).mockReturnValue({ data: [] } as never);
  vi.mocked(useRatePlans).mockReturnValue({
    data: [
      {
        id: "p1",
        name: "Tarifa real",
        status: "ACTIVE",
        baseNightlyAmountMinor: 650000,
        currency: "PYG",
        validFrom: null,
        validTo: null,
        description: "Estándar",
      },
    ],
    isLoading: false,
    isError: false,
    refetch: retry,
  } as never);
  result();
});
describe("DashboardPage", () => {
  it("presents real KPI values, seven statuses and navigation", () => {
    show();
    expect(screen.getByText("72%")).toBeVisible();
    expect(screen.getByText("₲ 12.500.000")).toBeVisible();
    expect(screen.getByText(/Reservas creadas en septiembre de 2026/)).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Reservas por estado" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(7);
    for (const label of [
      "Borrador",
      "Pendiente",
      "Confirmada",
      "En curso",
      "Completada",
      "Cancelada",
      "No show",
    ])
      expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByRole("link", { name: "Crear reserva" })).toHaveAttribute(
      "href",
      "/app/bookings/new",
    );
    expect(query).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business-a",
        accessToken: "access-token",
      }),
    );
  });
  it("formats the backend rate without recalculating from counts", () => {
    result({
      data: {
        ...data,
        occupancy: { ...data.occupancy, occupancyRateBasisPoints: 7123 },
      },
    });
    show();
    expect(screen.getAllByText("71,23%")).toHaveLength(1);
  });
  it("shows empty metrics including null, not zero percent", () => {
    result({
      data: {
        occupancy: {
          occupiedResourceNights: 0,
          sellableResourceNights: 0,
          occupancyRateBasisPoints: null,
        },
        revenue: { currency: "PYG", amountMinor: 0 },
        reservations: {
          total: 0,
          byStatus: Object.fromEntries(
            Object.keys(data.reservations.byStatus).map((key) => [key, 0]),
          ),
        },
      },
    });
    show();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Aún no hay actividad",
    );
    expect(screen.getByText("No hay datos diarios para este mes.")).toBeVisible();
    expect(screen.queryByText("0%")).not.toBeInTheDocument();
    expect(screen.getByText("₲ 0")).toBeVisible();
    expect(
      within(
        screen.getByRole("region", { name: "Reservas por estado" }),
      ).getAllByRole("listitem"),
    ).toHaveLength(7);
  });
  it("shows structural skeletons without stale metrics during fetching", () => {
    result({ isFetching: true });
    show();
    expect(
      screen.getByRole("status", { name: "Cargando resumen" }),
    ).toBeVisible();
    expect(screen.queryByText("₲ 12.500.000")).not.toBeInTheDocument();
  });
  it("shows global error and retries", async () => {
    result({ isError: true, error: new Error("network") });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar el resumen.",
    );
    expect(screen.queryByText("72%")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(retry).toHaveBeenCalledOnce();
  });
  it.each([
    [401, "Tu sesión ya no es válida"],
    [403, "No tienes permiso"],
  ])("explains HTTP %s without exposing backend details", (status, message) => {
    result({
      isError: true,
      error: new ApiError(status, "sensitive internal detail"),
    });
    show();
    expect(screen.getByRole("alert")).toHaveTextContent(message);
    expect(
      screen.queryByText("sensitive internal detail"),
    ).not.toBeInTheDocument();
  });
  it("maps a selected month immediately to an exact backend range", async () => {
    show();
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(query.mock.lastCall?.[0]).toEqual(expect.objectContaining({ from: "2026-08-01", to: "2026-09-01" }));
    await userEvent.click(screen.getByRole("button", { name: "Mes siguiente" }));
    expect(query.mock.lastCall?.[0]).toEqual(expect.objectContaining({ from: "2026-09-01", to: "2026-10-01" }));
  });
  it("uses the native month picker and returns to the current month", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Seleccionar mes"), { target: { value: "2026-12" } });
    expect(query.mock.lastCall?.[0]).toEqual(expect.objectContaining({ from: "2026-12-01", to: "2027-01-01" }));
    expect(screen.getByRole("button", { name: "Este mes" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Este mes" }));
    expect(screen.queryByRole("button", { name: "Este mes" })).not.toBeInTheDocument();
  });
  it("explains missing business configuration", () => {
    show("");
    expect(screen.getByRole("status")).toHaveTextContent(
      "No hay un negocio activo",
    );
  });
  it("offers login with no session and never manually refetches without authorization", async () => {
    auth.mockReturnValue({ session: null } as never);
    show();
    expect(
      screen.getByRole("link", { name: "Ir a iniciar sesión" }),
    ).toHaveAttribute("href", "/login");
    expect(useResources).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: "" }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Mes anterior" }));
    expect(retry).not.toHaveBeenCalled();
  });
  it("uses real catalog counts, tables and detail links", () => {
    show();
    expect(screen.getByText("1 de 2 activos")).toBeVisible();
    expect(screen.getByText("1 activas")).toBeVisible();
    expect(screen.getByRole("link", { name: /Recurso real/ })).toHaveAttribute(
      "href",
      "/app/resources/r1",
    );
    expect(screen.getByText("Tarifa real")).toBeVisible();
    expect(screen.getByText("₲ 650.000")).toBeVisible();
    const catalogs = screen.getByRole("region", { name: "Catálogos operativos" });
expect(within(catalogs).getAllByRole("table")).toHaveLength(2);
    expect(
      screen.getByRole("link", { name: "Ver todas las tarifas" }),
    ).toHaveAttribute("href", "/app/pricing");
    expect(useResources).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business-a",
        accessToken: "access-token",
      }),
    );
    expect(useRatePlans).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId: "business-a",
        accessToken: "access-token",
      }),
    );
  });
  it("keeps real catalogs visible when the aggregate fails", () => {
    result({ isError: true });
    show();
    expect(screen.getByText("Tarifa real")).toBeVisible();
    expect(screen.getByRole("link", { name: /Recurso real/ })).toBeVisible();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "No pudimos cargar el resumen",
    );
  });
  it("does not replace empty real catalogs with preview data", () => {
    vi.mocked(useResources).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    vi.mocked(useRatePlans).mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    } as never);
    show();
    expect(screen.getByText("Todavía no hay recursos.")).toBeVisible();
    expect(
      screen.getByText("Todavía no hay tarifas configuradas."),
    ).toBeVisible();
    const catalogs = screen.getByRole("region", { name: "Catálogos operativos" });
expect(within(catalogs).queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("₲ 12.500.000")).toBeVisible();
  });
  it("isolates catalog loading and errors and retries only the failed source", async () => {
    vi.mocked(useResources).mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: retry,
    } as never);
    vi.mocked(useRatePlans).mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);
    show();
    expect(
      screen.getByRole("status", { name: "Cargando tarifas" }),
    ).toBeVisible();
    expect(screen.getByText("₲ 12.500.000")).toBeVisible();
    await userEvent.click(
      screen.getByRole("button", { name: "Reintentar recursos" }),
    );
    expect(retry).toHaveBeenCalledOnce();
  });
});
