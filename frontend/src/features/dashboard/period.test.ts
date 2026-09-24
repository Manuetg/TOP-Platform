import { describe, expect, it } from "vitest";
import { currentDashboardMonth, dashboardMonthToPeriod, formatDashboardMonth, initialDashboardMonth, isValidDashboardMonth, shiftDashboardMonth, validateDashboardPeriod } from "./period";

describe("dashboard monthly period", () => {
  it.each([
    ["2026-09", { from: "2026-09-01", to: "2026-10-01" }],
    ["2026-12", { from: "2026-12-01", to: "2027-01-01" }],
    ["2028-02", { from: "2028-02-01", to: "2028-03-01" }],
  ])("maps %s to an exact calendar month", (month, period) => {
    expect(dashboardMonthToPeriod(month)).toEqual(period);
    expect(validateDashboardPeriod(period)).toBeNull();
  });

  it.each([["2026-00"], ["2026-13"], ["2026/09"], ["2026-9"]])("rejects invalid month %s", (month) => {
    expect(isValidDashboardMonth(month)).toBe(false);
  });

  it("moves across year boundaries", () => {
    expect(shiftDashboardMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftDashboardMonth("2027-01", -1)).toBe("2026-12");
  });

  it("uses the Business timezone for the current month", () => {
    const instant = new Date("2026-01-01T02:30:00.000Z");
    expect(currentDashboardMonth("America/Asuncion", instant)).toBe("2025-12");
    expect(initialDashboardMonth("America/Asuncion", instant)).toBe("2025-12");
  });

  it("formats a readable month label", () => {
    expect(formatDashboardMonth("2026-09")).toContain("septiembre");
  });
});
