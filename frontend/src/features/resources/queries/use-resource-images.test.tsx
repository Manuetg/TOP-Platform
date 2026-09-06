import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  renderHook,
  waitFor,
} from "@testing-library/react";
import type { PropsWithChildren } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { getResourceImages } from "../api/get-resource-images";
import { useResourceImages } from "./use-resource-images";

vi.mock("../api/get-resource-images", () => ({
  getResourceImages: vi.fn(),
}));

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
  }: PropsWithChildren) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  };
}

describe("useResourceImages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads images using the Business and Resource scope", async () => {
    vi.mocked(getResourceImages).mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useResourceImages({
          businessId: "business-1",
          resourceId: "resource-1",
          accessToken: "token",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(getResourceImages).toHaveBeenCalledWith({
      businessId: "business-1",
      resourceId: "resource-1",
      accessToken: "token",
    });
  });

  it("does not execute without Business or Resource identifiers", async () => {
    vi.mocked(getResourceImages).mockResolvedValue([]);

    const { result } = renderHook(
      () =>
        useResourceImages({
          businessId: "",
          resourceId: "",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(result.current.fetchStatus).toBe("idle");
    expect(getResourceImages).not.toHaveBeenCalled();
  });
});