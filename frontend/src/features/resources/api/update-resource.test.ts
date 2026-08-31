import { beforeEach, describe, expect, it, vi } from "vitest";
import { updateResource } from "./update-resource";

describe("updateResource", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("updates a resource using PATCH", async () => {
    const response = {
      id: "resource-1",
      businessId: "business-1",
      name: "Cabaña Premium",
      internalCode: "TOB-CAB-01",
      description: "Actualizada",
      capacityMinimum: 1,
      capacityMaximum: 5,
      capacityMaximumChildren: 2,
      status: "ACTIVE",
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

    const result = await updateResource({
      businessId: "business-1",
      resourceId: "resource-1",
      accessToken: "access-token",
      input: {
        name: "Cabaña Premium",
        description: "Actualizada",
        capacityMaximum: 5,
      },
    });

    expect(result).toEqual(response);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/businesses/business-1/resources/resource-1",
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

    expect(JSON.parse(String(options?.body))).toEqual({
      name: "Cabaña Premium",
      description: "Actualizada",
      capacityMaximum: 5,
    });
  });
});
