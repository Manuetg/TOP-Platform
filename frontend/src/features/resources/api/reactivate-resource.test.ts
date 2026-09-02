import { beforeEach, describe, expect, it, vi } from "vitest";
import { reactivateResource } from "./reactivate-resource";

describe("reactivateResource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reactiva un recurso mediante PATCH sin body", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "resource-1",
          businessId: "business-1",
          name: "Cabaña 1",
          internalCode: "CAB-1",
          description: null,
          capacityMinimum: 1,
          capacityMaximum: 4,
          capacityMaximumChildren: 2,
          status: "ACTIVE",
          sortOrder: 0,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-09-02T12:00:00.000Z",
          amenities: [],
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        },
      ),
    );

    await reactivateResource({
      businessId: "business-1",
      resourceId: "resource-1",
      accessToken: "access-token",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(String(url)).toContain(
      "/businesses/business-1/resources/resource-1/reactivate",
    );

    expect(options?.method).toBe("PATCH");

    const headers = new Headers(options?.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(options?.body).toBeUndefined();
  });
});
