import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { checkAvailability } from "./check-availability";

describe("checkAvailability", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("calls the business-scoped availability endpoint with the selected range", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({
            resourceId: "resource-1",
            from: "2026-09-10",
            to: "2026-09-12",
            status: "AVAILABLE",
            reasons: [],
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
            },
          },
        ),
      );

    const result = await checkAvailability({
      businessId: "business-1",
      resourceId: "resource-1",
      from: "2026-09-10",
      to: "2026-09-12",
      accessToken: "token-123",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [calledUrl, calledOptions] =
      fetchMock.mock.calls[0];

    expect(calledUrl.toString()).toContain(
      "/businesses/business-1/availability?",
    );

    expect(calledUrl.toString()).toContain(
      "resourceId=resource-1",
    );

    expect(calledUrl.toString()).toContain(
      "from=2026-09-10",
    );

    expect(calledUrl.toString()).toContain(
      "to=2026-09-12",
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

    expect(result).toEqual({
      resourceId: "resource-1",
      from: "2026-09-10",
      to: "2026-09-12",
      status: "AVAILABLE",
      reasons: [],
    });
  });
});