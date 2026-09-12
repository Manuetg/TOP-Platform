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
    expect(screen.getByText(/8 reservas creadas/)).toBeVisible();
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
    expect(screen.getByRole("link", { name: "Ver reservas" })).toHaveAttribute(
      "href",
      "/app/bookings",
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
    expect(screen.getAllByText("Sin inventario vendible")).toHaveLength(1);
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
  it("does not apply draft dates until submit", async () => {
    show();
    const original = query.mock.lastCall?.[0];
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: "2026-09-01" },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), {
      target: { value: "2026-10-02" },
    });
    expect(query.mock.lastCall?.[0]).toEqual(original);
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(query.mock.lastCall?.[0]).toEqual(
      expect.objectContaining({ from: "2026-09-01", to: "2026-10-02" }),
    );
  });
  it.each([
    ["", "2026-09-02"],
    ["2026-09-02", "2026-09-02"],
    ["2026-09-03", "2026-09-02"],
    ["2026-09-01", "2026-10-03"],
  ])("rejects invalid period without refreshing", async (from, to) => {
    show();
    const original = query.mock.lastCall?.[0];
    fireEvent.change(screen.getByLabelText("Desde"), {
      target: { value: from },
    });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: to } });
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(screen.getByRole("alert")).not.toBeEmptyDOMElement();
    expect(screen.getByLabelText("Desde")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(query.mock.lastCall?.[0]).toEqual(original);
    expect(retry).not.toHaveBeenCalled();
  });
  it("explains missing business configuration", () => {
    show("");
    expect(screen.getByRole("status")).toHaveTextContent(
      "VITE_DEV_BUSINESS_ID",
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
    await userEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(retry).not.toHaveBeenCalled();
  });
  it("uses real catalog counts, tables and detail links", () => {
    show();
    expect(
      within(
        screen.getByRole("article", { name: "Recursos activos" }),
      ).getByText("1"),
    ).toBeVisible();
    expect(
      within(
        screen.getByRole("article", { name: "Recursos activos" }),
      ).getByText("de 2 totales"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: /Recurso real/ })).toHaveAttribute(
      "href",
      "/app/resources/r1",
    );
    expect(screen.getByText("Tarifa real")).toBeVisible();
    expect(screen.getByText("₲ 650.000")).toBeVisible();
    expect(screen.getAllByRole("table")).toHaveLength(2);
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
  it("identifies preview widgets without asserting mock values as business behavior", () => {
    show();
    for (const name of ["Hoy", "Actividad reciente", "Próximos pasos"]) {
      const widget = screen.getByRole("region", { name });
      expect(widget).toHaveAttribute("data-source", "MOCK");
      expect(within(widget).getByText("Vista previa")).toBeVisible();
    }
    expect(
      screen.getByRole("article", { name: "Próximos check-ins" }),
    ).toHaveAttribute("data-source", "MOCK");
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
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
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
