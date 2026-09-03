import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listAmenities } from "../api/list-amenities";
import { useAmenities } from "./use-amenities";

vi.mock("../api/list-amenities", () => ({
  listAmenities: vi.fn(),
}));

const mockedListAmenities = vi.mocked(listAmenities);

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

describe("useAmenities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads the business-scoped amenity catalog when authenticated", async () => {
    mockedListAmenities.mockResolvedValue([
      {
        id: "amenity-1",
        code: "WIFI",
        name: "Wi-Fi",
        category: "CONNECTIVITY",
        sortOrder: 1,
        scope: "GLOBAL",
      },
      {
        id: "amenity-2",
        code: "CUSTOM_123",
        name: "Muelle privado",
        category: "OUTDOOR",
        sortOrder: 0,
        scope: "BUSINESS",
      },
    ]);

    const { result } = renderHook(
      () =>
        useAmenities({
          businessId: "business-1",
          accessToken: "access-token",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(mockedListAmenities).toHaveBeenCalledWith({
      businessId: "business-1",
      accessToken: "access-token",
    });

    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: "amenity-1",
        scope: "GLOBAL",
      }),
      expect.objectContaining({
        id: "amenity-2",
        scope: "BUSINESS",
      }),
    ]);
  });

  it("does not load without an access token", () => {
    renderHook(
      () =>
        useAmenities({
          businessId: "business-1",
          accessToken: null,
        }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(mockedListAmenities).not.toHaveBeenCalled();
  });

  it("does not load without a business id", () => {
    renderHook(
      () =>
        useAmenities({
          businessId: "",
          accessToken: "access-token",
        }),
      {
        wrapper: createWrapper(),
      },
    );

    expect(mockedListAmenities).not.toHaveBeenCalled();
  });
});