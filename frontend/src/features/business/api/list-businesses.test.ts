import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/api-client";
import { listBusinesses } from "./list-businesses";

afterEach(() => vi.unstubAllGlobals());

describe("listBusinesses", () => {
  it("requests accessible businesses with bearer authorization and preserves nullable fields", async () => {
    const businesses = [{ id: "business-1", name: "Tobera", legalName: null, taxId: null, timezone: "America/Asuncion", currency: "PYG", status: "ACTIVE", createdAt: "2026-01-01", updatedAt: "2026-01-01" }];
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(businesses), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(listBusinesses("token-123")).resolves.toEqual(businesses);
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/businesses");
    expect(new Headers(request.headers).get("Authorization")).toBe("Bearer token-123");
  });

  it("propagates API errors", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } })));
    await expect(listBusinesses("expired")).rejects.toBeInstanceOf(ApiError);
  });
});
