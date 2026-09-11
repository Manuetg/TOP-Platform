import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createBlock } from "./create-block";

describe("createBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a block using the business and resource scoped endpoint", async () => {
    const response = {
      id: "block-1",
      businessId: "business-1",
      resourceId: "resource-1",
      type: "MAINTENANCE",
      reason: "Mantenimiento",
      notes: "Revisión general",
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-21T12:00:00.000Z",
      status: "SCHEDULED",
      effectiveStatus: "SCHEDULED",
      cancellationReason: null,
      cancelledAt: null,
      createdAt: "2026-09-10T12:00:00.000Z",
      updatedAt: "2026-09-10T12:00:00.000Z",
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

    const result = await createBlock({
      businessId: "business-1",
      resourceId: "resource-1",
      type: "MAINTENANCE",
      reason: "Mantenimiento",
      notes: "Revisión general",
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-21T12:00:00.000Z",
      accessToken: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] =
      fetchMock.mock.calls[0];

    expect(calledUrl.toString()).toContain(
      "/businesses/business-1/resources/resource-1/blocks",
    );

    expect(calledOptions).toEqual(
      expect.objectContaining({
        method: "POST",
      }),
    );

    const headers = new Headers(
      calledOptions?.headers,
    );

    expect(
      headers.get("Authorization"),
    ).toBe("Bearer token-123");

    expect(
      JSON.parse(
        String(calledOptions?.body),
      ),
    ).toEqual({
      type: "MAINTENANCE",
      reason: "Mantenimiento",
      notes: "Revisión general",
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-21T12:00:00.000Z",
    });

    expect(result).toEqual(response);
  });
});