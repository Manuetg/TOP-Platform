import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
} from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AuthProvider } from "../../auth/context/AuthContext";
import { disableResource } from "../api/disable-resource";
import { reactivateResource } from "../api/reactivate-resource";
import { useResource } from "../queries/use-resource";
import type { Resource } from "../types/resource.types";
import { ResourceDetailPage } from "./ResourceDetailPage";

vi.mock("../queries/use-resource", () => ({
  useResource: vi.fn(),
}));

vi.mock("../api/disable-resource", () => ({
  disableResource: vi.fn(),
}));

vi.mock("../api/reactivate-resource", () => ({
  reactivateResource: vi.fn(),
}));
const mockedUseResource = vi.mocked(useResource);
const mockedDisableResource = vi.mocked(disableResource);
const mockedReactivateResource = vi.mocked(reactivateResource);

const activeResource: Resource = {
  id: "resource-1",
  businessId: "business-1",
  name: "Cabaña Norte",
  internalCode: "CAB-01",
  description: "Vista al lago",
  capacityMinimum: 1,
  capacityMaximum: 4,
  capacityMaximumChildren: 2,
  status: "ACTIVE",
  sortOrder: 1,
  createdAt: "2026-08-30T00:00:00.000Z",
  updatedAt: "2026-08-30T00:00:00.000Z",
  amenities: [
    {
      id: "amenity-1",
      code: "WIFI",
      name: "Wi-Fi",
      category: "GENERAL",
    },
  ],
};

function mockResource(resource: Resource) {
  mockedUseResource.mockReturnValue({
    data: resource,
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const result = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter
          initialEntries={["/app/resources/resource-1"]}
        >
          <Routes>
            <Route
              path="/app/resources/:resourceId"
              element={<ResourceDetailPage />}
            />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
  };
}

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockedUseResource.mockReset();
    mockedDisableResource.mockReset();
    mockedReactivateResource.mockReset();
  });

  it("renders the resource detail", () => {
    mockResource(activeResource);

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("CAB-01")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(
      screen.getByText("Vista al lago"),
    ).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Poner fuera de servicio",
      }),
    ).toBeInTheDocument();
  });

  it("disables an active resource after confirmation", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const updatedResource: Resource = {
      ...activeResource,
      status: "OUT_OF_SERVICE",
      updatedAt: "2026-08-31T01:00:00.000Z",
    };

    mockedDisableResource.mockResolvedValue(updatedResource);

    const confirmMock = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    const { queryClient } = renderPage();

    const setQueryDataSpy = vi.spyOn(
      queryClient,
      "setQueryData",
    );

    const invalidateQueriesSpy = vi.spyOn(
      queryClient,
      "invalidateQueries",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Poner fuera de servicio",
      }),
    );

    expect(confirmMock).toHaveBeenCalledWith(
      '¿Querés poner "Cabaña Norte" fuera de servicio?',
    );

    await waitFor(() => {
      expect(mockedDisableResource).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: "resource-1",
        accessToken: undefined,
      });
    });

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        [
          "resources",
          expect.any(String),
          "resource-1",
        ],
        updatedResource,
      );
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [
        "resources",
        expect.any(String),
      ],
      exact: true,
    });
  });

  it("reactivates an out-of-service resource after confirmation", async () => {
    const user = userEvent.setup();

    const outOfServiceResource: Resource = {
      ...activeResource,
      status: "OUT_OF_SERVICE",
    };

    mockResource(outOfServiceResource);

    const updatedResource: Resource = {
      ...outOfServiceResource,
      status: "ACTIVE",
      updatedAt: "2026-09-02T14:00:00.000Z",
    };

    mockedReactivateResource.mockResolvedValue(updatedResource);

    const confirmMock = vi
      .spyOn(window, "confirm")
      .mockReturnValue(true);

    const { queryClient } = renderPage();

    const setQueryDataSpy = vi.spyOn(
      queryClient,
      "setQueryData",
    );

    const invalidateQueriesSpy = vi.spyOn(
      queryClient,
      "invalidateQueries",
    );

    expect(
      screen.getByText("Fuera de servicio"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Poner fuera de servicio",
      }),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Reactivar recurso",
      }),
    );

    expect(confirmMock).toHaveBeenCalledWith(
      '¿Querés reactivar "Cabaña Norte"?',
    );

    await waitFor(() => {
      expect(mockedReactivateResource).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: "resource-1",
        accessToken: undefined,
      });
    });

    await waitFor(() => {
      expect(setQueryDataSpy).toHaveBeenCalledWith(
        [
          "resources",
          expect.any(String),
          "resource-1",
        ],
        updatedResource,
      );
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [
        "resources",
        expect.any(String),
      ],
      exact: true,
    });
  });

  it("does not offer operational transitions for an archived resource", () => {
    mockResource({
      ...activeResource,
      status: "ARCHIVED",
    });

    renderPage();

    expect(
      screen.getByText("Archivado"),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Poner fuera de servicio",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Reactivar recurso",
      }),
    ).not.toBeInTheDocument();
  });
});
