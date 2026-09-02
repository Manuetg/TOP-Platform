import { beforeEach, describe, expect, it, vi } from "vitest";
import { disableResource } from "./disable-resource";

describe("disableResource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("takes an active resource out of service using PATCH", async () => {
    const response = {
      id: "resource-1",
      businessId: "business-1",
      name: "Cabaña 1",
      internalCode: "CAB-01",
      description: null,
      capacityMinimum: 1,
      capacityMaximum: 4,
      capacityMaximumChildren: 2,
      status: "OUT_OF_SERVICE",
      sortOrder: 1,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T01:00:00.000Z",
      amenities: [],
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    const result = await disableResource({
      businessId: "business-1",
      resourceId: "resource-1",
      accessToken: "access-token",
    });

    expect(result).toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/businesses/business-1/resources/resource-1/disable",
      ),
      expect.objectContaining({
        method: "PATCH",
        headers: expect.any(Headers),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(options?.body).toBeUndefined();
  });
});
