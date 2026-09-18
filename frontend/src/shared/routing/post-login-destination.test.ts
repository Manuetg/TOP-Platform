import { describe, expect, it } from "vitest";
import { resolvePostLoginDestination } from "./post-login-destination";

describe("resolvePostLoginDestination", () => {
  it.each([
    "/app",
    "/app/resources",
    "/app/resources/123?tab=images#gallery",
    "/app?view=summary",
  ])("preserves the valid internal destination %s", (destination) => {
    expect(resolvePostLoginDestination(destination)).toBe(destination);
  });

  it.each([
    null,
    "",
    "/application",
    "/app-other",
    "/login",
    "https://example.com",
    "//example.com",
    "javascript:alert(1)",
    "/app/../login",
    "/app/%2e%2e/login",
    "/app/%252e%252e/login",
    "/app/%2f%2fexample.com",
    "/app/%5cexample",
    "/app/%0alogin",
    "/app/%zz",
  ])("falls back for unsafe destination %s", (destination) => {
    expect(resolvePostLoginDestination(destination)).toBe("/app");
  });
});
