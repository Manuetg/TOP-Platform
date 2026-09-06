import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import { getResourceImages } from "./get-resource-images";

vi.mock("../../../shared/api/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("getResourceImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requests the Business-scoped Resource images endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue([]);

    await getResourceImages({
      businessId: "business-1",
      resourceId: "resource-1",
      accessToken: "token",
    });

    expect(apiRequest).toHaveBeenCalledWith(
      "/businesses/business-1/resources/resource-1/images",
      {
        method: "GET",
        accessToken: "token",
      },
    );
  });

  it("returns the image collection from the API client", async () => {
    const images = [
      {
        id: "image-1",
        resourceId: "resource-1",
        url: "https://signed.test/image-1",
        mimeType: "image/jpeg",
        sizeBytes: 128,
        sortOrder: 0,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
    ];

    vi.mocked(apiRequest).mockResolvedValue(images);

    await expect(
      getResourceImages({
        businessId: "business-1",
        resourceId: "resource-1",
      }),
    ).resolves.toEqual(images);
  });
});