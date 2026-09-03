import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAmenities } from "./list-amenities";

describe("listAmenities", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("lists global and business amenities for the selected business", async () => {
    const response = [
      {
        id: "amenity-1",
        code: "WIFI",
        name: "Wi-Fi",
        category: "CONNECTIVITY",
        sortOrder: 1,
        scope: "GLOBAL" as const,
      },
      {
        id: "amenity-2",
        code: "CUSTOM_123",
        name: "Muelle privado",
        category: "OUTDOOR",
        sortOrder: 0,
        scope: "BUSINESS" as const,
      },
    ];

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

    const result = await listAmenities({
      businessId: "business-1",
      accessToken: "access-token",
    });

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(String(url)).toContain(
      "/businesses/business-1/amenities",
    );
    expect(options?.method).toBe("GET");

    const headers = new Headers(options?.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(options?.body).toBeUndefined();
  });
});