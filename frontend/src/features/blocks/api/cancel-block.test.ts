import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { cancelBlock } from "./cancel-block";

describe("cancelBlock", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("cancels a block using the business-scoped endpoint", async () => {
    const response = {
      id: "block-1",
      businessId: "business-1",
      resourceId: "resource-1",
      type: "MAINTENANCE",
      reason: "Mantenimiento",
      notes: null,
      startsAt: "2026-09-20T12:00:00.000Z",
      endsAt: "2026-09-21T12:00:00.000Z",
      status: "CANCELLED",
      effectiveStatus: "CANCELLED",
      cancellationReason: "Reprogramado",
      cancelledAt: "2026-09-10T18:00:00.000Z",
      createdAt: "2026-09-01T12:00:00.000Z",
      updatedAt: "2026-09-10T18:00:00.000Z",
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

    const result = await cancelBlock({
      businessId: "business-1",
      blockId: "block-1",
      reason: "Reprogramado",
      accessToken: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] =
      fetchMock.mock.calls[0];

    expect(calledUrl.toString()).toContain(
      "/businesses/business-1/blocks/block-1/cancel",
    );

    expect(calledOptions).toEqual(
      expect.objectContaining({
        method: "PATCH",
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
      reason: "Reprogramado",
    });

    expect(result).toEqual(response);
  });
});