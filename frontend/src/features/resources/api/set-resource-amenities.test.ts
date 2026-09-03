import { beforeEach, describe, expect, it, vi } from "vitest";
import { setResourceAmenities } from "./set-resource-amenities";

describe("setResourceAmenities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("replaces the complete amenity assignment using PUT", async () => {
    const response = {
      id: "resource-1",
      businessId: "business-1",
      name: "Cabaña Norte",
      internalCode: "CAB-01",
      description: null,
      capacityMinimum: 1,
      capacityMaximum: 4,
      capacityMaximumChildren: 2,
      status: "ACTIVE",
      sortOrder: 1,
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-02T15:00:00.000Z",
      amenities: [
        {
          id: "amenity-1",
          code: "WIFI",
          name: "Wi-Fi",
          category: "GENERAL",
          scope: "GLOBAL",
        },
      ],
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

    const result = await setResourceAmenities({
      businessId: "business-1",
      resourceId: "resource-1",
      amenityIds: ["amenity-1"],
      accessToken: "access-token",
    });

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(String(url)).toContain(
      "/businesses/business-1/resources/resource-1/amenities",
    );

    expect(options?.method).toBe("PUT");

    const headers = new Headers(options?.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(options?.body).toBe(
      JSON.stringify({
        amenityIds: ["amenity-1"],
      }),
    );
  });
});
