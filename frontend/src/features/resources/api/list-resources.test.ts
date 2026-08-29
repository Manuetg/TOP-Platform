import { afterEach, describe, expect, it, vi } from "vitest";
import { listResources } from "./list-resources";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("listResources", () => {
  it("requests the resources for the selected business with bearer authorization", async () => {
    const response = [
      {
        id: "resource-1",
        businessId: "business-1",
        name: "Cabaña 1",
        internalCode: "CAB-01",
        description: null,
        capacityMinimum: 1,
        capacityMaximum: 4,
        capacityMaximumChildren: 2,
        status: "ACTIVE",
        sortOrder: 1,
        createdAt: "2026-08-28T00:00:00.000Z",
        updatedAt: "2026-08-28T00:00:00.000Z",
        amenities: [],
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    await expect(
      listResources({
        businessId: "business-1",
        accessToken: "token-123",
      }),
    ).resolves.toEqual(response);

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = new Headers(request.headers);

    expect(url).toContain("/businesses/business-1/resources");
    expect(request.method).toBe("GET");
    expect(headers.get("Authorization")).toBe("Bearer token-123");
  });
});
