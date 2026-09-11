import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { listBlocks } from "./list-blocks";

describe("listBlocks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the business-scoped blocks endpoint with supported filters", async () => {
    const response = [
      {
        id: "block-1",
        businessId: "business-1",
        resourceId: "resource-1",
        type: "MAINTENANCE",
        reason: "Mantenimiento",
        notes: null,
        startsAt: "2026-09-10T00:00:00.000Z",
        endsAt: "2026-09-12T23:59:59.999Z",
        status: "SCHEDULED",
        effectiveStatus: "SCHEDULED",
        cancellationReason: null,
        cancelledAt: null,
        createdAt: "2026-09-01T12:00:00.000Z",
        updatedAt: "2026-09-01T12:00:00.000Z",
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

    const result = await listBlocks({
      businessId: "business-1",
      resourceId: "resource-1",
      from: "2026-09-10T00:00:00.000Z",
      to: "2026-09-12T23:59:59.999Z",
      accessToken: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] =
      fetchMock.mock.calls[0];

    expect(calledUrl.toString()).toContain(
      "/businesses/business-1/blocks?",
    );

    expect(calledUrl.toString()).toContain(
      "resourceId=resource-1",
    );

    expect(calledUrl.toString()).toContain(
      "from=2026-09-10T00%3A00%3A00.000Z",
    );

    expect(calledUrl.toString()).toContain(
      "to=2026-09-12T23%3A59%3A59.999Z",
    );

    expect(calledOptions).toEqual(
      expect.objectContaining({
        method: "GET",
      }),
    );

    const headers = new Headers(
      calledOptions?.headers,
    );

    expect(
      headers.get("Authorization"),
    ).toBe("Bearer token-123");

    expect(result).toEqual(response);
  });

  it("omits query params when filters are not provided", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify([]), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
          },
        }),
      );

    await listBlocks({
      businessId: "business-1",
      accessToken: "token-123",
    });

    const [calledUrl] =
      fetchMock.mock.calls[0];

    expect(calledUrl.toString()).toContain(
      "/businesses/business-1/blocks",
    );

    expect(calledUrl.toString()).not.toContain("?");
  });
});