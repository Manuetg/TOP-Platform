import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiRequest } from "../../../shared/api/api-client";
import type { ResourceImage } from "../types/resource.types";
import { uploadResourceImage } from "./upload-resource-image";

vi.mock("../../../shared/api/api-client", () => ({
  apiRequest: vi.fn(),
}));

const mockedApiRequest = vi.mocked(apiRequest);

describe("uploadResourceImage", () => {
  beforeEach(() => {
    mockedApiRequest.mockReset();
  });

  it("uploads the image to the Business-scoped Resource endpoint", async () => {
    const file = new File(
      ["image-content"],
      "cabana.jpg",
      {
        type: "image/jpeg",
      },
    );

    const response: ResourceImage = {
      id: "image-1",
      resourceId: "resource-1",
      url: "https://signed.test/cabana.jpg",
      mimeType: "image/jpeg",
      sizeBytes: file.size,
      sortOrder: 0,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };

    mockedApiRequest.mockResolvedValue(response);

    await expect(
      uploadResourceImage({
        businessId: "business-1",
        resourceId: "resource-1",
        file,
        accessToken: "token-123",
      }),
    ).resolves.toEqual(response);

    expect(mockedApiRequest).toHaveBeenCalledTimes(1);

    const [path, options] =
      mockedApiRequest.mock.calls[0];

    expect(path).toBe(
      "/businesses/business-1/resources/resource-1/images",
    );

    expect(options).toMatchObject({
      method: "POST",
      accessToken: "token-123",
    });

    expect(options?.body).toBeInstanceOf(FormData);

    const formData = options?.body as FormData;

    expect(formData.get("file")).toBe(file);
  });
});