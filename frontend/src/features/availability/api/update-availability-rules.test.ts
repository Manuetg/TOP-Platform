import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { updateAvailabilityRules } from "./update-availability-rules";

describe("updateAvailabilityRules", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updates business-scoped availability rules", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            businessId: "business-1",
            pendingBlocksAvailability: false,
            bufferBeforeDays: 2,
            bufferAfterDays: 3,
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
      await updateAvailabilityRules({
        businessId: "business-1",
        accessToken: "token-123",
        input: {
          pendingBlocksAvailability: false,
          bufferBeforeDays: 2,
          bufferAfterDays: 3,
        },
      });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, options] =
      fetchMock.mock.calls[0];

    expect(url.toString()).toContain(
      "/businesses/business-1/availability-rules",
    );

    expect(options).toEqual(
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          pendingBlocksAvailability: false,
          bufferBeforeDays: 2,
          bufferAfterDays: 3,
        }),
      }),
    );

    const headers = new Headers(
      options?.headers,
    );

    expect(
      headers.get("Authorization"),
    ).toBe("Bearer token-123");

    expect(result.bufferBeforeDays).toBe(2);
    expect(result.bufferAfterDays).toBe(3);
  });
});