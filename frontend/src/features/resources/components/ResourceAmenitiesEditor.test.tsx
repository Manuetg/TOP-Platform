import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps, ReactNode } from "react";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createBusinessAmenity } from "../api/create-business-amenity";
import type { Amenity } from "../api/list-amenities";
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

type EditorProps = ComponentProps<typeof ResourceAmenitiesEditor>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function renderEditor(overrides: Partial<EditorProps> = {}) {
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

  const props: EditorProps = {
    businessId: "business-1",
    resource,
    accessToken: "access-token",
    canManage: true,
    ...overrides,
  };

  const result = render(
    <ResourceAmenitiesEditor {...props} />,
    {
      wrapper: Wrapper,
    },
  );

  return {
    ...result,
    queryClient,
    rerenderEditor: (nextProps: Partial<EditorProps>) =>
      result.rerender(<ResourceAmenitiesEditor {...props} {...nextProps} />),
  };
}

describe("ResourceAmenitiesEditor", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
        name: "Gestionar amenidades",
      }),
    ).toBeInTheDocument();
  });

  it("starts editing with the current amenities selected", async () => {
    const user = userEvent.setup();

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenidades",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Wi-Fi",
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: "Estacionamiento",
      }),
    ).not.toBeChecked();

    expect(
      screen.queryByRole("combobox", {
        name: "Categoría",
      }),
    ).not.toBeInTheDocument();
  });

  it("creates a business amenity with GENERAL and selects it immediately", async () => {
    const user = userEvent.setup();

    mockedCreateBusinessAmenity.mockResolvedValue({
      id: "amenity-custom-1",
      code: "CUSTOM_123",
      name: "Muelle privado",
      category: "GENERAL",
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
        name: "Gestionar amenidades",
      }),
    );

    await user.type(
      screen.getByRole("textbox", {
        name: "Nombre",
      }),
      " Muelle privado ",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear amenidad personalizada",
      }),
    );

    await waitFor(() => {
      expect(
        mockedCreateBusinessAmenity,
      ).toHaveBeenCalledWith({
        businessId: "business-1",
        name: "Muelle privado",
        category: "GENERAL",
        accessToken: "access-token",
      });
    });

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: ["amenities", "business-1"],
      exact: true,
    });

    expect(
      screen.getByRole("checkbox", {
        name: "Muelle privado",
      }),
    ).toBeChecked();
  });

  it("keeps the editor open and shows an error when custom creation fails", async () => {
    const user = userEvent.setup();

    mockedCreateBusinessAmenity.mockRejectedValue(
      new Error("No se pudo crear la amenidad."),
    );

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenidades",
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
        name: "Crear amenidad personalizada",
      }),
    );

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("No se pudo crear la amenidad.");

    expect(
      screen.getByRole("button", {
        name: "Guardar amenidades",
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
        name: "Gestionar amenidades",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Estacionamiento",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenidades",
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
      ["resources", "business-1", "resource-1"],
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
      category: "GENERAL",
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
          category: "GENERAL",
          scope: "BUSINESS",
        },
      ],
    });

    renderEditor();

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenidades",
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
        name: "Crear amenidad personalizada",
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("checkbox", {
          name: "Muelle privado",
        }),
      ).toBeChecked();
    });

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenidades",
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
        name: "Gestionar amenidades",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Wi-Fi",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Guardar amenidades",
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
        name: "Gestionar amenidades",
      }),
    );

    await user.click(
      screen.getByRole("checkbox", {
        name: "Estacionamiento",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Cancelar",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Gestionar amenidades",
      }),
    );

    expect(
      screen.getByRole("checkbox", {
        name: "Wi-Fi",
      }),
    ).toBeChecked();

    expect(
      screen.getByRole("checkbox", {
        name: "Estacionamiento",
      }),
    ).not.toBeChecked();
  });

  it("keeps assigned amenities readable without management controls", () => {
    renderEditor({ canManage: false });

    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar amenidades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Crear amenidad personalizada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar amenidades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(mockedSetResourceAmenities).not.toHaveBeenCalled();
    expect(mockedCreateBusinessAmenity).not.toHaveBeenCalled();
  });

  it("focuses the first checkbox on keyboard entry and restores the trigger after canceling", async () => {
    const user = userEvent.setup();
    renderEditor();
    const trigger = screen.getByRole("button", { name: "Gestionar amenidades" });
    trigger.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).toHaveFocus();
    await user.click(screen.getByRole("checkbox", { name: "Estacionamiento" }));
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    expect(screen.getByRole("button", { name: "Gestionar amenidades" })).toHaveFocus();
    expect(mockedSetResourceAmenities).not.toHaveBeenCalled();
  });

  it("focuses an available input when the catalog has no checkboxes", async () => {
    const user = userEvent.setup();
    mockedUseAmenities.mockReturnValue({
      data: [], isLoading: false, isError: false, error: null, refetch: vi.fn(),
    } as never);
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));

    expect(screen.getByRole("textbox", { name: "Nombre" })).toHaveFocus();
  });

  it("restores focus to the management trigger after a successful save", async () => {
    const user = userEvent.setup();
    const pending = deferred<Resource>();
    mockedSetResourceAmenities.mockReturnValue(pending.promise);
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.click(screen.getByRole("button", { name: "Guardar amenidades" }));
    await act(async () => {
      pending.resolve(resource);
      await pending.promise;
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Gestionar amenidades" })).toHaveFocus();
    });
    expect(mockedSetResourceAmenities).toHaveBeenCalledTimes(1);
  });

  it("preserves the selection and error after a failed save, then discards them on cancel", async () => {
    const user = userEvent.setup();
    mockedSetResourceAmenities.mockRejectedValue(new Error("No pudimos guardar los cambios."));
    renderEditor();

    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.click(screen.getByRole("checkbox", { name: "Estacionamiento" }));
    await user.click(screen.getByRole("button", { name: "Guardar amenidades" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No pudimos guardar los cambios.");
    expect(screen.getByRole("checkbox", { name: "Estacionamiento" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Cancelar" }));
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Estacionamiento" })).not.toBeChecked();
    expect(mockedSetResourceAmenities).toHaveBeenCalledTimes(1);
  });

  it("sends one assignment when saving is clicked repeatedly before rendering", async () => {
    const user = userEvent.setup();
    const pending = deferred<Resource>();
    mockedSetResourceAmenities.mockReturnValue(pending.promise);
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    const save = screen.getByRole("button", { name: "Guardar amenidades" });

    act(() => {
      fireEvent.click(save);
      fireEvent.click(save);
    });

    expect(mockedSetResourceAmenities).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).toBeDisabled();
    await act(async () => {
      pending.resolve(resource);
      await pending.promise;
    });
  });

  it("sends one creation for repeated Enter and click and prevents a simultaneous assignment", async () => {
    const user = userEvent.setup();
    const pending = deferred<Amenity>();
    mockedCreateBusinessAmenity.mockReturnValue(pending.promise);
    renderEditor();
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    const name = screen.getByRole("textbox", { name: "Nombre" });
    await user.type(name, "Muelle privado");
    const create = screen.getByRole("button", { name: "Crear amenidad personalizada" });
    const save = screen.getByRole("button", { name: "Guardar amenidades" });

    act(() => {
      fireEvent.keyDown(name, { key: "Enter" });
      fireEvent.keyDown(name, { key: "Enter" });
      fireEvent.click(create);
      fireEvent.click(save);
    });

    expect(mockedCreateBusinessAmenity).toHaveBeenCalledTimes(1);
    expect(mockedSetResourceAmenities).not.toHaveBeenCalled();
    expect(name).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    await act(async () => {
      pending.resolve({
        id: "amenity-custom-1", code: "CUSTOM_123", name: "Muelle privado",
        category: "GENERAL", scope: "BUSINESS", sortOrder: 0,
      });
      await pending.promise;
    });
    expect(screen.getByRole("checkbox", { name: "Muelle privado" })).toBeChecked();
  });

  it("ignores a creation response after the editor unmounts", async () => {
    const user = userEvent.setup();
    const pending = deferred<Amenity>();
    mockedCreateBusinessAmenity.mockReturnValue(pending.promise);
    const { queryClient, unmount } = renderEditor();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Muelle privado");
    await user.click(screen.getByRole("button", { name: "Crear amenidad personalizada" }));
    unmount();

    await act(async () => {
      pending.resolve({
        id: "amenity-custom-1", code: "CUSTOM_123", name: "Muelle privado",
        category: "GENERAL", scope: "BUSINESS", sortOrder: 0,
      });
      await pending.promise;
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(mockedSetResourceAmenities).not.toHaveBeenCalled();
  });

  it("ignores a creation response after switching resources", async () => {
    const user = userEvent.setup();
    const pending = deferred<Amenity>();
    mockedCreateBusinessAmenity.mockReturnValue(pending.promise);
    const { queryClient, rerenderEditor } = renderEditor();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.type(screen.getByRole("textbox", { name: "Nombre" }), "Muelle privado");
    await user.click(screen.getByRole("button", { name: "Crear amenidad personalizada" }));
    rerenderEditor({ resource: { ...resource, id: "resource-2", amenities: [] } });

    await act(async () => {
      pending.resolve({
        id: "amenity-custom-1", code: "CUSTOM_123", name: "Muelle privado",
        category: "GENERAL", scope: "BUSINESS", sortOrder: 0,
      });
      await pending.promise;
    });
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));

    expect(screen.queryByRole("checkbox", { name: "Muelle privado" })).not.toBeInTheDocument();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("preserves an edited selection when the same resource refreshes", async () => {
    const user = userEvent.setup();
    const { rerenderEditor } = renderEditor();
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.click(screen.getByRole("checkbox", { name: "Estacionamiento" }));
    rerenderEditor({ resource: { ...resource, amenities: [], updatedAt: "2026-09-03T00:00:00.000Z" } });

    expect(screen.getByRole("checkbox", { name: "Wi-Fi" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Estacionamiento" })).toBeChecked();
    expect(mockedSetResourceAmenities).not.toHaveBeenCalled();
  });

  it.each(["business", "resource"] as const)("ignores an assignment response after the %s scope changes", async (scope) => {
    const user = userEvent.setup();
    const pending = deferred<Resource>();
    mockedSetResourceAmenities.mockReturnValue(pending.promise);
    const { queryClient, rerenderEditor } = renderEditor();
    const updateCache = vi.spyOn(queryClient, "setQueryData");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.click(screen.getByRole("button", { name: "Guardar amenidades" }));

    rerenderEditor({
      businessId: scope === "business" ? "business-2" : "business-1",
      resource: {
        ...resource,
        id: "resource-2",
        businessId: scope === "business" ? "business-2" : "business-1",
        amenities: [],
      },
    });
    await act(async () => {
      pending.resolve(resource);
      await pending.promise;
    });

    expect(screen.getByText("Sin amenidades configuradas.")).toBeInTheDocument();
    expect(screen.queryByText("Wi-Fi")).not.toBeInTheDocument();
    expect(updateCache).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("removes management controls and ignores a pending response after permission is revoked", async () => {
    const user = userEvent.setup();
    const pending = deferred<Resource>();
    mockedSetResourceAmenities.mockReturnValue(pending.promise);
    const { queryClient, rerenderEditor } = renderEditor();
    const updateCache = vi.spyOn(queryClient, "setQueryData");
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    await user.click(screen.getByRole("button", { name: "Gestionar amenidades" }));
    await user.click(screen.getByRole("button", { name: "Guardar amenidades" }));
    rerenderEditor({ canManage: false });

    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await act(async () => {
      pending.resolve(resource);
      await pending.promise;
    });

    expect(updateCache).not.toHaveBeenCalled();
    expect(invalidate).not.toHaveBeenCalled();
  });
});
