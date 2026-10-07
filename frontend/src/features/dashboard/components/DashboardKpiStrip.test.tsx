import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardResponse } from "../types/dashboard.types";
import { DashboardKpiStrip } from "./DashboardKpiStrip";

const dashboard: DashboardResponse = {
  occupancy: {
    occupiedResourceNights: 13,
    sellableResourceNights: 137,
    occupancyRateBasisPoints: 949,
    weekends: { total: 4, full: 0, partial: 4, available: 0, items: [] },
  },
  reservations: {
    total: 27,
    byStatus: {
      DRAFT: 2,
      PENDING: 3,
      CONFIRMED: 16,
      IN_PROGRESS: 2,
      COMPLETED: 2,
      CANCELLED: 1,
      NO_SHOW: 1,
    },
  },
  revenue: { currency: "PYG", amountMinor: 6696950 },
};

describe("DashboardKpiStrip", () => {
  beforeEach(() => {
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows the final real KPI values immediately without waiting for animation frames", () => {
    render(<DashboardKpiStrip dashboard={dashboard} />);

    const occupancy = screen.getByRole("article", { name: "Ocupación" });
    expect(within(occupancy).getByText("13 de 137 noches")).toBeVisible();
    expect(within(occupancy).getByText("9,49%")).toBeVisible();

    const weekends = screen.getByRole("article", { name: "Fines de semana" });
    expect(within(weekends).getByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "0 / 4")).toBeVisible();
    expect(within(weekends).getByText("0 completos · 4 parciales")).toBeVisible();

    const reservations = screen.getByRole("article", { name: "Reservas confirmadas" });
    expect(within(reservations).getByText("16")).toBeVisible();
    expect(within(reservations).getByText("59% de 27 reservas")).toBeVisible();
    for (const label of ["Borrador", "Pendiente", "Confirmada", "En curso", "Finalizada", "Cancelada", "No show"]) {
      expect(within(reservations).getByTitle(label)).toBeInTheDocument();
    }
    expect(within(reservations).queryByTitle("COMPLETED")).not.toBeInTheDocument();

    const revenue = screen.getByRole("article", { name: "Ingresos" });
    expect(within(revenue).getByText("₲ 6.696.950")).toBeVisible();
    expect(within(revenue).getByText("Monto del mes")).toBeVisible();
  });

  it("replaces all numeric KPI values directly when the loaded month changes", () => {
    const { rerender } = render(<DashboardKpiStrip dashboard={dashboard} />);
    const nextMonth: DashboardResponse = {
      ...dashboard,
      occupancy: { ...dashboard.occupancy, occupancyRateBasisPoints: 3871 },
      revenue: { currency: "PYG", amountMinor: 450000 },
      reservations: {
        ...dashboard.reservations,
        total: 14,
        byStatus: { ...dashboard.reservations.byStatus, CONFIRMED: 3 },
      },
    };

    rerender(<DashboardKpiStrip dashboard={nextMonth} />);

    expect(within(screen.getByRole("article", { name: "Ocupación" })).getByText("38,71%")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Ingresos" })).getByText("₲ 450.000")).toBeVisible();
    expect(within(screen.getByRole("article", { name: "Reservas confirmadas" })).getByText("3")).toBeVisible();
    expect(screen.queryByText("₲ 6.696.950")).not.toBeInTheDocument();
    expect(screen.queryByText("9,49%")).not.toBeInTheDocument();
  });
});
