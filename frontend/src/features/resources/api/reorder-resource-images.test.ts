import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import { reorderResourceImages } from "./reorder-resource-images";

vi.mock("../../../shared/api/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("reorderResourceImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends the complete image order to the Business-scoped Resource endpoint", async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined);

    await expect(
      reorderResourceImages({
        businessId: "business-1",
        resourceId: "resource-1",
        imageIds: ["image-2", "image-1"],
        accessToken: "token",
      }),
    ).resolves.toBeUndefined();

    expect(apiRequest).toHaveBeenCalledWith(
      "/businesses/business-1/resources/resource-1/images/order",
      {
        method: "PUT",
        body: JSON.stringify({
          imageIds: ["image-2", "image-1"],
        }),
        accessToken: "token",
      },
    );
  });
});