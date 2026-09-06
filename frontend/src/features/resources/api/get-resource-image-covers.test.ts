import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import { getResourceImageCovers } from "./get-resource-image-covers";

vi.mock("../../../shared/api/api-client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("getResourceImageCovers", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("requests the Business Resource cover batch endpoint", async () => {
    mockedApiRequest.mockResolvedValue([
      {
        resourceId: "resource-1",
        imageId: "image-1",
        url: "https://signed.test/cover",
      },
    ]);

    await expect(
      getResourceImageCovers({
        businessId: "business-1",
        accessToken: "token",
      }),
    ).resolves.toEqual([
      {
        resourceId: "resource-1",
        imageId: "image-1",
        url: "https://signed.test/cover",
      },
    ]);

    expect(mockedApiRequest).toHaveBeenCalledTimes(1);

    expect(mockedApiRequest).toHaveBeenCalledWith(
      "/businesses/business-1/resources/images/covers",
      {
        method: "GET",
        accessToken: "token",
      },
    );
  });
});