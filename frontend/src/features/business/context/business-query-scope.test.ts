import { describe, expect, it } from "vitest";
import { isBusinessQuery, isTenantQuery } from "./business-query-scope";

describe("business query scope", () => {
  it("isolates messaging queries by business", () => {
    expect(isTenantQuery(["messaging", "settings", "business-1"])).toBe(true);
    expect(isBusinessQuery(["messaging", "templates", "business-1"], "business-1")).toBe(true);
    expect(isBusinessQuery(["messaging", "templates", "business-2"], "business-1")).toBe(false);
  });
});

