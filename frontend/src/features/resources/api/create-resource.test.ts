import { beforeEach, describe, expect, it, vi } from "vitest";
import { createResource } from "./create-resource";

describe("createResource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a resource using the business-scoped endpoint", async () => {
    const response = {
      id: "resource-1",
      businessId: "business-1",
      name: "Cabaña 4",
      internalCode: "TOB-CAB-04",
      description: null,
      capacityMinimum: 1,
      capacityMaximum: 4,
      capacityMaximumChildren: 2,
      status: "ACTIVE",
      sortOrder: 0,
      createdAt: "2026-08-31T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
      amenities: [],
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

    const result = await createResource({
      businessId: "business-1",
      accessToken: "access-token",
      input: {
        name: "Cabaña 4",
        internalCode: "TOB-CAB-04",
        capacityMinimum: 1,
        capacityMaximum: 4,
        capacityMaximumChildren: 2,
        sortOrder: 0,
      },
    });

    expect(result).toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/businesses/business-1/resources"),
      expect.objectContaining({
        method: "POST",
        headers: expect.any(Headers),
      }),
    );

    const [, options] = fetchMock.mock.calls[0];
    const headers = options?.headers as Headers;

    expect(headers.get("Authorization")).toBe(
      "Bearer access-token",
    );

    expect(JSON.parse(String(options?.body))).toEqual({
      name: "Cabaña 4",
      internalCode: "TOB-CAB-04",
      capacityMinimum: 1,
      capacityMaximum: 4,
      capacityMaximumChildren: 2,
      sortOrder: 0,
    });
  });
});
