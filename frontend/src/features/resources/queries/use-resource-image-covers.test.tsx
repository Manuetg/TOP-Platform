import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getResourceImageCovers } from "../api/get-resource-image-covers";
import { useResourceImageCovers } from "./use-resource-image-covers";

vi.mock("../api/get-resource-image-covers", () => ({
  getResourceImageCovers: vi.fn(),
}));

const mockedGetResourceImageCovers =
  vi.mocked(getResourceImageCovers);

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({
    children,
  }: {
    children: ReactNode;
  }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("useResourceImageCovers", () => {
  beforeEach(() => {
    mockedGetResourceImageCovers.mockReset();
  });

  it("loads one Business-wide Resource cover batch", async () => {
    mockedGetResourceImageCovers.mockResolvedValue([
      {
        resourceId: "resource-1",
        imageId: "image-1",
        url: "https://signed.test/cover",
      },
    ]);

    const { result } = renderHook(
      () =>
        useResourceImageCovers({
          businessId: "business-1",
          accessToken: "token",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(
      mockedGetResourceImageCovers,
    ).toHaveBeenCalledTimes(1);

    expect(
      mockedGetResourceImageCovers,
    ).toHaveBeenCalledWith({
      businessId: "business-1",
      accessToken: "token",
    });

    expect(result.current.data).toEqual([
      {
        resourceId: "resource-1",
        imageId: "image-1",
        url: "https://signed.test/cover",
      },
    ]);
  });

  it("does not request covers without a Business id", () => {
    renderHook(
      () =>
        useResourceImageCovers({
          businessId: "",
          accessToken: "token",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(
      mockedGetResourceImageCovers,
    ).not.toHaveBeenCalled();
  });
});