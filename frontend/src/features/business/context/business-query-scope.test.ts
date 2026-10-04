import { describe, expect, it } from "vitest";
import { isBusinessQuery, isTenantQuery } from "./business-query-scope";

describe("business query scope", () => {
  it("isolates messaging queries by business", () => {
    expect(isTenantQuery(["messaging", "settings", "business-1"])).toBe(true);
    expect(isBusinessQuery(["messaging", "settings", "business-1"], "business-1")).toBe(true);
    expect(isBusinessQuery(["messaging", "templates", "business-1"], "business-1")).toBe(true);
    expect(isBusinessQuery(["messaging", "templates", "business-2"], "business-1")).toBe(false);
  });

  it("isolates inbox messaging keys by business", () => {
    expect(isBusinessQuery(["messaging", "inbox", "conversations", "business-1"], "business-1")).toBe(true);
    expect(isBusinessQuery(["messaging", "inbox", "messages", "business-2", "conversation-1"], "business-1")).toBe(false);
  });
});
