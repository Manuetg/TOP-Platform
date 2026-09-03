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
import type { ReactNode } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createBusinessAmenity } from "../api/create-business-amenity";
import { setResourceAmenities } from "../api/set-resource-amenities";
import { useAmenities } from "../queries/use-amenities";
import type { Resource } from "../types/resource.types";
import { ResourceAmenitiesEditor } from "./ResourceAmenitiesEditor";

vi.mock("../queries/use-amenities", () => ({
  useAmenities: vi.fn(),
}));

vi.mock("../api/set-resource-amenities", () => ({
  setResourceAmenities: vi.fn(),
}));

vi.mock("../api/create-business-amenity", () => ({
  createBusinessAmenity: vi.fn(),
}));

const mockedUseAmenities = vi.mocked(useAmenities);
const mockedSetResourceAmenities = vi.mocked(
  setResourceAmenities,
);
const mockedCreateBusinessAmenity = vi.mocked(
  createBusinessAmenity,
);

const resource: Resource = {
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
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
  amenities: [
    {
      id: "amenity-1",
      code: "WIFI",
      name: "Wi-Fi",
      category: "GENERAL",
      scope: "GLOBAL",
    },
  ],
};

function mockAmenities() {
  mockedUseAmenities.mockReturnValue({
    data: [
      {
        id: "amenity-1",
        code: "WIFI",
        name: "Wi-Fi",
        category: "GENERAL",
        scope: "GLOBAL",
        sortOrder: 1,
      },
      {
        id: "amenity-2",
        code: "PARKING",
        name: "Estacionamiento",
        category: "GENERAL",
        scope: "GLOBAL",
        sortOrder: 2,
      },
    ],
    isLoading: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  } as never);
}

function renderEditor() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  function Wrapper({
    children,
  }: {
    children: ReactNode;
  }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    );
  }

  const result = render(
    <ResourceAmenitiesEditor
      businessId="business-1"
      resource={resource}
      accessToken="access-token"
    />,
    {
      wrapper: Wrapper,
    },
  );

  return {
    ...result,
    queryClient,
  };
}

describe("ResourceAmenitiesEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAmenities();
  });

  it("loads amenities for the current business", () => {
    renderEditor();

    expect(mockedUseAmenities).toHaveBeenCalledWith({
      businessId: "business-1",
      accessToken: "access-token",
    });
  });

  it("shows the currently assigned amenities", () => {
    renderEditor();

    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    ).toBeInTheDocument();
  });

  it("starts editing with the current amenities selected", async () => {
    const user = userEvent.setup();

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: /Wi-Fi/i,
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: /Estacionamiento/i,
      }),
    ).not.toBeChecked();
  });

  it("creates a business amenity and selects it immediately", async () => {
    const user = userEvent.setup();

    mockedCreateBusinessAmenity.mockResolvedValue({
      id: "amenity-custom-1",
      code: "CUSTOM_123",
      name: "Muelle privado",
      category: "OUTDOOR",
      sortOrder: 0,
      scope: "BUSINESS",
    });

    const { queryClient } = renderEditor();

    const invalidateQueriesSpy = vi.spyOn(
      queryClient,
      "invalidateQueries",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Nombre",
      }),
      " Muelle privado ",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Categoría",
      }),
      "OUTDOOR",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear amenity personalizado",
      }),
    );

    await waitFor(() => {
      expect(
        mockedCreateBusinessAmenity,
      ).toHaveBeenCalledWith({
        businessId: "business-1",
        name: "Muelle privado",
        category: "OUTDOOR",
        accessToken: "access-token",
      });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["amenities", "business-1"],
      exact: true,
    });

    expect(
      screen.getByRole("checkbox", {
        name: /Muelle privado/i,
      }),
    ).toBeChecked();

    expect(
      screen.getByText(/Exterior · Personalizado/i),
    ).toBeInTheDocument();
  });

  it("keeps the editor open and shows an error when custom creation fails", async () => {
    const user = userEvent.setup();

    mockedCreateBusinessAmenity.mockRejectedValue(
      new Error("No se pudo crear el amenity."),
    );

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Nombre",
      }),
      "Muelle privado",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear amenity personalizado",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("No se pudo crear el amenity.");

    expect(
      screen.getByRole("button", {
        name: "Guardar amenities",
      }),
    ).toBeInTheDocument();
  });

  it("replaces the complete amenity assignment", async () => {
    const user = userEvent.setup();

    const updatedResource: Resource = {
      ...resource,
      amenities: [
        ...resource.amenities,
        {
          id: "amenity-2",
          code: "PARKING",
          name: "Estacionamiento",
          category: "GENERAL",
          scope: "GLOBAL",
        },
      ],
      updatedAt: "2026-09-02T15:00:00.000Z",
    };

    mockedSetResourceAmenities.mockResolvedValue(
      updatedResource,
    );

    const { queryClient } = renderEditor();

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
        name: "Gestionar amenities",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Estacionamiento/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenities",
      }),
    );

    await waitFor(() => {
      expect(
        mockedSetResourceAmenities,
      ).toHaveBeenCalledWith({
        businessId: "business-1",
        resourceId: "resource-1",
        amenityIds: ["amenity-1", "amenity-2"],
        accessToken: "access-token",
      });
    });

    expect(setQueryDataSpy).toHaveBeenCalledWith(
      [
        "resources",
        "business-1",
        "resource-1",
      ],
      updatedResource,
    );

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["resources", "business-1"],
      exact: true,
    });
  });

  it("includes a newly created amenity when saving the resource", async () => {
    const user = userEvent.setup();

    mockedCreateBusinessAmenity.mockResolvedValue({
      id: "amenity-custom-1",
      code: "CUSTOM_123",
      name: "Muelle privado",
      category: "OUTDOOR",
      sortOrder: 0,
      scope: "BUSINESS",
    });

    mockedSetResourceAmenities.mockResolvedValue({
      ...resource,
      amenities: [
        ...resource.amenities,
        {
          id: "amenity-custom-1",
          code: "CUSTOM_123",
          name: "Muelle privado",
          category: "OUTDOOR",
          scope: "BUSINESS",
        },
      ],
    });

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Nombre",
      }),
      "Muelle privado",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear amenity personalizado",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: /Muelle privado/i,
        }),
      ).toBeChecked();
    });

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenities",
      }),
    );

    await waitFor(() => {
      expect(
        mockedSetResourceAmenities,
      ).toHaveBeenCalledWith({
        businessId: "business-1",
        resourceId: "resource-1",
        amenityIds: [
          "amenity-1",
          "amenity-custom-1",
        ],
        accessToken: "access-token",
      });
    });
  });

  it("can remove all amenities", async () => {
    const user = userEvent.setup();

    mockedSetResourceAmenities.mockResolvedValue({
      ...resource,
      amenities: [],
    });

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Wi-Fi/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenities",
      }),
    );

    await waitFor(() => {
      expect(
        mockedSetResourceAmenities,
      ).toHaveBeenCalledWith({
        businessId: "business-1",
        resourceId: "resource-1",
        amenityIds: [],
        accessToken: "access-token",
      });
    });
  });

  it("restores the original selection after canceling", async () => {
    const user = userEvent.setup();

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: /Estacionamiento/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Cancelar",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenities",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: /Wi-Fi/i,
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: /Estacionamiento/i,
      }),
    ).not.toBeChecked();
  });
});