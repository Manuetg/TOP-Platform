import { describe, it, expect } from "vitest";
import { initialDashboardPeriod, validateDashboardPeriod } from "./period";

describe("dashboard period UX", () => {
  it.each([
    ["", "2026-09-02"], ["2026-09-01", ""], ["01-09-2026", "2026-09-02"],
    ["2026-02-30", "2026-03-02"], ["2026-02-29", "2026-03-02"],
    ["2026-09-02", "2026-09-02"], ["2026-09-03", "2026-09-02"], ["2026-09-01", "2026-10-03"],
  ])("rejects invalid %s to %s", (from, to) => expect(validateDashboardPeriod({ from, to })).not.toBeNull());
  it.each([["2026-09-01", "2026-10-02"], ["2028-02-29", "2028-03-01"], ["2099-12-31", "2100-01-01"]])("allows valid 31 days, leap and future dates", (from, to) => expect(validateDashboardPeriod({ from, to })).toBeNull());
  it("proposes seven local calendar days across year boundary", () => {
    expect(initialDashboardPeriod(new Date(2026, 0, 2, 0, 15))).toEqual({ from: "2025-12-27", to: "2026-01-03" });
  });
});
