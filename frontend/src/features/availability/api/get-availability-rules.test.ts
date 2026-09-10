import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getAvailabilityRules } from "./get-availability-rules";

describe("getAvailabilityRules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads the business-scoped availability rules", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            businessId: "business-1",
            pendingBlocksAvailability: true,
            bufferBeforeDays: 1,
            bufferAfterDays: 2,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const result =
      await getAvailabilityRules({
        businessId: "business-1",
        accessToken: "token-123",
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url.toString()).toContain(
      "/businesses/business-1/availability-rules",
    );

    expect(options).toEqual(
      expect.objectContaining({
        method: "GET",
      }),
    );

    const headers = new Headers(
      options?.headers,
    );

    expect(
      headers.get("Authorization"),
    ).toBe("Bearer token-123");

    expect(result).toEqual({
      businessId: "business-1",
      pendingBlocksAvailability: true,
      bufferBeforeDays: 1,
      bufferAfterDays: 2,
    });
  });
});