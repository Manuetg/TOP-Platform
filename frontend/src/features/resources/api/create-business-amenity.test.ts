import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBusinessAmenity } from "./create-business-amenity";

describe("createBusinessAmenity", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a custom amenity for the selected business", async () => {
    const response = {
      id: "amenity-custom-1",
      code: "CUSTOM_123",
      name: "Muelle privado",
      category: "OUTDOOR" as const,
      sortOrder: 0,
      scope: "BUSINESS" as const,
    };

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 201,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    const result = await createBusinessAmenity({
      businessId: "business-1",
      name: "Muelle privado",
      category: "OUTDOOR",
      accessToken: "access-token",
    });

    expect(result).toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] = fetchMock.mock.calls[0];

    expect(String(url)).toContain(
      "/businesses/business-1/amenities",
    );

    expect(options?.method).toBe("POST");

    const headers = new Headers(options?.headers);

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(options?.body).toBe(
      JSON.stringify({
        name: "Muelle privado",
        category: "OUTDOOR",
      }),
    );
  });
});