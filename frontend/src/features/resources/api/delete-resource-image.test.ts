import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import { deleteResourceImage } from "./delete-resource-image";

vi.mock("../../../shared/api/api-client", () => ({
  apiRequest: vi.fn(),
}));

describe("deleteResourceImage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("deletes the Business-scoped Resource image", async () => {
    vi.mocked(apiRequest).mockResolvedValue(undefined);

    await expect(
      deleteResourceImage({
        businessId: "business-1",
        resourceId: "resource-1",
        imageId: "image-1",
        accessToken: "token",
      }),
    ).resolves.toBeUndefined();

    expect(apiRequest).toHaveBeenCalledWith(
      "/businesses/business-1/resources/resource-1/images/image-1",
      {
        method: "DELETE",
        accessToken: "token",
      },
    );
  });
});