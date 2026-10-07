import { expect, it } from "vitest";
import { isBusinessQuery, isTenantQuery } from "./business-query-scope";
it("limpia consultas financieras por identidad y negocio sin incluir otra cuenta", () => {
  const key = ["finance", "owner-a", "business-a", "report", { from: "2026-09-01", to: "2026-10-01" }];
  expect(isTenantQuery(key)).toBe(true); expect(isBusinessQuery(key, "business-a")).toBe(true); expect(isBusinessQuery(key, "business-b")).toBe(false);
});
