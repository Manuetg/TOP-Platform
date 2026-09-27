import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { DashboardHospitalityIntelligence } from "./DashboardHospitalityIntelligence";
import type { DashboardResponse } from "../types/dashboard.types";

const dashboard: DashboardResponse = {
  occupancy: {
    occupiedResourceNights: 3,
    sellableResourceNights: 34,
    occupancyRateBasisPoints: 882,
    daily: [
      { date: "2026-09-18", occupiedResourceNights: 0, sellableResourceNights: 4, availableResourceNights: 4, occupancyRateBasisPoints: 0 },
      { date: "2026-09-19", occupiedResourceNights: 2, sellableResourceNights: 4, availableResourceNights: 2, occupancyRateBasisPoints: 5000 },
      { date: "2026-09-20", occupiedResourceNights: 3, sellableResourceNights: 4, availableResourceNights: 1, occupancyRateBasisPoints: 7500 },
    ],
    weekend: {
      occupiedNights: 0,
      sellableNights: 9,
      availableNights: 9,
      occupancyRateBasisPoints: 0,
    },
    weekday: {
      occupiedNights: 3,
      sellableNights: 25,
      availableNights: 22,
      occupancyRateBasisPoints: 1200,
    },
    weekends: {
      total: 2,
      full: 0,
      partial: 1,
      available: 1,
      items: [
        {
          from: "2026-09-18",
          to: "2026-09-20",
          totalResources: 4,
          availableResources: 2,
          status: "PARTIAL",
        },
        {
          from: "2026-09-25",
          to: "2026-09-27",
          totalResources: 4,
          availableResources: 4,
          status: "AVAILABLE",
        },
      ],
    },
  },
  revenue: { currency: "PYG", amountMinor: 12500000 },
  reservations: {
    total: 11,
    byStatus: {
      DRAFT: 0,
      PENDING: 0,
      CONFIRMED: 10,
      IN_PROGRESS: 0,
      COMPLETED: 0,
      CANCELLED: 1,
      NO_SHOW: 0,
    },
  },
};

describe("DashboardHospitalityIntelligence", () => {
  it("renders the daily occupancy surface and reservation percentages", () => {
    render(
      <MemoryRouter>
        <DashboardHospitalityIntelligence dashboard={dashboard} month="2026-09" />
      </MemoryRouter>,
    );

    const occupancy = screen.getByLabelText("Ocupación diaria en porcentaje").closest("article");
    expect(occupancy).not.toBeNull();
    expect(screen.getByText("Ocupación diaria")).toBeVisible();
    expect(screen.queryByText("Ocupación según tipo de día")).not.toBeInTheDocument();
    expect(within(occupancy as HTMLElement).getByText("0%")).toBeVisible();
    const health = screen.getByRole("region", { name: "Reservas por estado" });
    expect(within(health).getByText("91%")).toBeVisible();
    expect(within(health).getByText("9%")).toBeVisible();
    expect(within(health).getByText("11")).toBeVisible();
  });

  it("renders each weekend as a segmented availability item", () => {
    render(
      <MemoryRouter>
        <DashboardHospitalityIntelligence dashboard={dashboard} month="2026-09" />
      </MemoryRouter>,
    );

    const table = screen.getByRole("table", { name: "Disponibilidad de fines de semana de septiembre de 2026" });
    expect(within(table).getByText("2026-09-18")).toBeVisible();
    expect(within(table).getByText("2026-09-25")).toBeVisible();
    expect(within(table).getAllByRole("row")).toHaveLength(3);
expect(within(table).getByText("Parcial")).toBeVisible();
expect(within(table).getByText("Disponible")).toBeVisible();
  });

  it("shows the factual opportunity and does not invent trends", () => {
    render(
      <MemoryRouter>
        <DashboardHospitalityIntelligence dashboard={dashboard} month="2026-09" />
      </MemoryRouter>,
    );

    expect(screen.getByText("Fin de semana con disponibilidad")).toBeVisible();
    expect(screen.queryByText(/crecimiento|tendencia|versus/i)).not.toBeInTheDocument();
  });
});
