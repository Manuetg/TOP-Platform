import { render, screen, waitFor, within } from "@testing-library/react";
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
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(performance.now() + 1000);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => vi.unstubAllGlobals());

  it("prioritizes the real KPI values with a centered primary metric", async () => {
    render(<DashboardKpiStrip dashboard={dashboard} />);

    const occupancy = screen.getByRole("article", { name: "Ocupación" });
    expect(within(occupancy).getByText("13 de 137 noches")).toBeVisible();
    await waitFor(() => expect(within(occupancy).getByText("9,49%")).toBeVisible());

    const weekends = screen.getByRole("article", { name: "Fines de semana" });
    expect(within(weekends).getByText((_, element) => element?.textContent?.replace(/\s+/g, " ").trim() === "0 / 4")).toBeVisible();
    expect(within(weekends).getByText("0 completos · 4 parciales")).toBeVisible();

    const reservations = screen.getByRole("article", { name: "Reservas confirmadas" });
    await waitFor(() => expect(within(reservations).getByText("16")).toBeVisible());
    expect(within(reservations).getByText("59% de 27 reservas")).toBeVisible();

    const revenue = screen.getByRole("article", { name: "Ingresos" });
    await waitFor(() => expect(within(revenue).getByText("₲ 6.696.950")).toBeVisible());
    expect(within(revenue).getByText("Monto del mes")).toBeVisible();
  });
});
