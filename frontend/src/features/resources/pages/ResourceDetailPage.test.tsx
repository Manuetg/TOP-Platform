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
import { deleteResourceImage } from "../api/delete-resource-image";
import { disableResource } from "../api/disable-resource";
import { reactivateResource } from "../api/reactivate-resource";
import { reorderResourceImages } from "../api/reorder-resource-images";
import { uploadResourceImage } from "../api/upload-resource-image";
import { useResourceImages } from "../queries/use-resource-images";
import { useResource } from "../queries/use-resource";
import type {
  Resource,
  ResourceImage,
} from "../types/resource.types";
import { ResourceDetailPage } from "./ResourceDetailPage";

vi.mock("../queries/use-resource", () => ({
  useResource: vi.fn(),
}));

vi.mock("../queries/use-resource-images", () => ({
  useResourceImages: vi.fn(),
}));
vi.mock("../api/upload-resource-image", () => ({
  uploadResourceImage: vi.fn(),
}));

vi.mock("../api/delete-resource-image", () => ({
  deleteResourceImage: vi.fn(),
}));

vi.mock("../api/reorder-resource-images", () => ({
  reorderResourceImages: vi.fn(),
}));
vi.mock("../api/disable-resource", () => ({
  disableResource: vi.fn(),
}));

vi.mock("../api/reactivate-resource", () => ({
  reactivateResource: vi.fn(),
}));
const mockedUseResource = vi.mocked(useResource);
const mockedUseResourceImages = vi.mocked(useResourceImages);
const mockedDisableResource = vi.mocked(disableResource);
const mockedReactivateResource = vi.mocked(reactivateResource);
const mockedUploadResourceImage = vi.mocked(uploadResourceImage);
const mockedDeleteResourceImage = vi.mocked(deleteResourceImage);
const mockedReorderResourceImages = vi.mocked(reorderResourceImages);

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
      scope: "GLOBAL",
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
    mockedUseResourceImages.mockReset();
    mockedDisableResource.mockReset();
    mockedReactivateResource.mockReset();
    mockedUploadResourceImage.mockReset();
    mockedDeleteResourceImage.mockReset();
    mockedReorderResourceImages.mockReset();

    mockedUseResourceImages.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);
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

  it("renders the first persisted Resource image", () => {
    mockResource(activeResource);

    const image: ResourceImage = {
      id: "image-1",
      resourceId: activeResource.id,
      url: "https://signed.test/cabana-norte.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      sortOrder: 0,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };

    mockedUseResourceImages.mockReturnValue({
      data: [image],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("img", {
        name: activeResource.name,
      }),
    ).toHaveAttribute("src", image.url);

    expect(
      screen.queryByText("Imagen del recurso no configurada"),
    ).not.toBeInTheDocument();
  });

  it("navigates through persisted Resource images", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const images: ResourceImage[] = [
      {
        id: "image-1",
        resourceId: activeResource.id,
        url: "https://signed.test/image-1.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: 0,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "image-2",
        resourceId: activeResource.id,
        url: "https://signed.test/image-2.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        sortOrder: 1,
        createdAt: "2026-09-03T00:01:00.000Z",
        updatedAt: "2026-09-03T00:01:00.000Z",
      },
      {
        id: "image-3",
        resourceId: activeResource.id,
        url: "https://signed.test/image-3.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3072,
        sortOrder: 2,
        createdAt: "2026-09-03T00:02:00.000Z",
        updatedAt: "2026-09-03T00:02:00.000Z",
      },
    ];

    mockedUseResourceImages.mockReturnValue({
      data: images,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    const displayedImage = screen.getByRole("img", {
      name: activeResource.name,
    });

    expect(displayedImage).toHaveAttribute(
      "src",
      images[0].url,
    );

    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Imagen siguiente",
      }),
    );

    expect(displayedImage).toHaveAttribute(
      "src",
      images[1].url,
    );

    expect(screen.getByText("2 / 3")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Ver imagen 3 de 3",
      }),
    );

    expect(displayedImage).toHaveAttribute(
      "src",
      images[2].url,
    );

    expect(screen.getByText("3 / 3")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Imagen siguiente",
      }),
    );

    expect(displayedImage).toHaveAttribute(
      "src",
      images[0].url,
    );

    await user.click(
      screen.getByRole("button", {
        name: "Imagen anterior",
      }),
    );

    expect(displayedImage).toHaveAttribute(
      "src",
      images[2].url,
    );
  });
  it("keeps the fallback when the Resource has no images", () => {
    mockResource(activeResource);

    renderPage();

    expect(
      screen.getByRole("img", {
        name: `Imagen de ${activeResource.name} no configurada`,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Imagen del recurso no configurada"),
    ).toBeInTheDocument();
  });

  it("keeps the fallback when image loading fails", () => {
    mockResource(activeResource);

    mockedUseResourceImages.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("No pudimos cargar las imágenes."),
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("img", {
        name: `Imagen de ${activeResource.name} no configurada`,
      }),
    ).toBeInTheDocument();
  });

  it("shows a neutral loading state while images are loading", () => {
    mockResource(activeResource);

    mockedUseResourceImages.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("Cargando imagen…");
  });
  it("uploads a valid Resource image and updates the images query", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const uploadedImage: ResourceImage = {
      id: "image-uploaded",
      resourceId: activeResource.id,
      url: "https://signed.test/uploaded.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 5,
      sortOrder: 0,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };

    mockedUploadResourceImage.mockResolvedValue(uploadedImage);

    const { container, queryClient } = renderPage();

    const setQueryDataSpy = vi.spyOn(
      queryClient,
      "setQueryData",
    );

    const invalidateQueriesSpy = vi.spyOn(
      queryClient,
      "invalidateQueries",
    );

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(
      ["image"],
      "cabana.jpg",
      {
        type: "image/jpeg",
      },
    );

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(mockedUploadResourceImage).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: activeResource.id,
        file,
        accessToken: undefined,
      });
    });

    expect(setQueryDataSpy).toHaveBeenCalledWith(
      [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      [uploadedImage],
    );

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      exact: true,
    });
  });

  it("rejects unsupported image types before upload", async () => {
    const user = userEvent.setup({
      applyAccept: false,
    });

    mockResource(activeResource);

    const { container } = renderPage();

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(
      ["image"],
      "cabana.gif",
      {
        type: "image/gif",
      },
    );

    await user.upload(fileInput, file);

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "La imagen debe ser JPEG, PNG o WEBP.",
    );

    expect(
      mockedUploadResourceImage,
    ).not.toHaveBeenCalled();
  });

  it("rejects images larger than 5 MB before upload", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const { container } = renderPage();

    const fileInput = container.querySelector(
      'input[type="file"]',
    ) as HTMLInputElement;

    const file = new File(
      [new Uint8Array(5 * 1024 * 1024 + 1)],
      "cabana.jpg",
      {
        type: "image/jpeg",
      },
    );

    await user.upload(fileInput, file);

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "La imagen no puede superar 5 MB.",
    );

    expect(
      mockedUploadResourceImage,
    ).not.toHaveBeenCalled();
  });

  it("disables image upload when the Resource already has 10 images", () => {
    mockResource(activeResource);

    const images: ResourceImage[] = Array.from(
      { length: 10 },
      (_, index) => ({
        id: `image-${index}`,
        resourceId: activeResource.id,
        url: `https://signed.test/image-${index}.jpg`,
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: index,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      }),
    );

    mockedUseResourceImages.mockReturnValue({
      data: images,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("button", {
        name: "Agregar imagen",
      }),
    ).toBeDisabled();

    expect(
      screen.getByText("10 de 10"),
    ).toBeInTheDocument();
  });
  it("moves the selected Resource image to the right", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const images: ResourceImage[] = [
      {
        id: "image-1",
        resourceId: activeResource.id,
        url: "https://signed.test/image-1.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: 0,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "image-2",
        resourceId: activeResource.id,
        url: "https://signed.test/image-2.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        sortOrder: 1,
        createdAt: "2026-09-03T00:01:00.000Z",
        updatedAt: "2026-09-03T00:01:00.000Z",
      },
      {
        id: "image-3",
        resourceId: activeResource.id,
        url: "https://signed.test/image-3.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3072,
        sortOrder: 2,
        createdAt: "2026-09-03T00:02:00.000Z",
        updatedAt: "2026-09-03T00:02:00.000Z",
      },
    ];

    mockedUseResourceImages.mockReturnValue({
      data: images,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    mockedReorderResourceImages.mockResolvedValue(undefined);

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
      screen.getByRole("button", {
        name: "Mover izquierda",
      }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", {
        name: "Mover derecha",
      }),
    );

    await waitFor(() => {
      expect(mockedReorderResourceImages).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: activeResource.id,
        imageIds: ["image-2", "image-1", "image-3"],
        accessToken: undefined,
      });
    });

    expect(setQueryDataSpy).toHaveBeenCalledWith(
      [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      [
        {
          ...images[1],
          sortOrder: 0,
        },
        {
          ...images[0],
          sortOrder: 1,
        },
        {
          ...images[2],
          sortOrder: 2,
        },
      ],
    );

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      exact: true,
    });
  });

  it("deletes the selected Resource image after confirmation", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const images: ResourceImage[] = [
      {
        id: "image-1",
        resourceId: activeResource.id,
        url: "https://signed.test/image-1.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: 0,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "image-2",
        resourceId: activeResource.id,
        url: "https://signed.test/image-2.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 2048,
        sortOrder: 1,
        createdAt: "2026-09-03T00:01:00.000Z",
        updatedAt: "2026-09-03T00:01:00.000Z",
      },
      {
        id: "image-3",
        resourceId: activeResource.id,
        url: "https://signed.test/image-3.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 3072,
        sortOrder: 2,
        createdAt: "2026-09-03T00:02:00.000Z",
        updatedAt: "2026-09-03T00:02:00.000Z",
      },
    ];

    mockedUseResourceImages.mockReturnValue({
      data: images,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    mockedDeleteResourceImage.mockResolvedValue(undefined);

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
        name: "Ver imagen 2 de 3",
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: "Eliminar",
      }),
    );

    expect(confirmMock).toHaveBeenCalledWith(
      "¿Querés eliminar esta imagen del recurso?",
    );

    await waitFor(() => {
      expect(mockedDeleteResourceImage).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: activeResource.id,
        imageId: "image-2",
        accessToken: undefined,
      });
    });

    expect(setQueryDataSpy).toHaveBeenCalledWith(
      [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      [
        {
          ...images[0],
          sortOrder: 0,
        },
        {
          ...images[2],
          sortOrder: 1,
        },
      ],
    );

    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: [
        "resources",
        expect.any(String),
        activeResource.id,
        "images",
      ],
      exact: true,
    });
  });

  it("does not delete a Resource image when confirmation is cancelled", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const image: ResourceImage = {
      id: "image-1",
      resourceId: activeResource.id,
      url: "https://signed.test/image-1.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1024,
      sortOrder: 0,
      createdAt: "2026-09-03T00:00:00.000Z",
      updatedAt: "2026-09-03T00:00:00.000Z",
    };

    mockedUseResourceImages.mockReturnValue({
      data: [image],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    vi.spyOn(window, "confirm").mockReturnValue(false);

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: "Eliminar",
      }),
    );

    expect(mockedDeleteResourceImage).not.toHaveBeenCalled();
  });

  it("disables image management for an archived Resource", () => {
    mockResource({
      ...activeResource,
      status: "ARCHIVED",
    });

    const images: ResourceImage[] = [
      {
        id: "image-1",
        resourceId: activeResource.id,
        url: "https://signed.test/image-1.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: 0,
        createdAt: "2026-09-03T00:00:00.000Z",
        updatedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "image-2",
        resourceId: activeResource.id,
        url: "https://signed.test/image-2.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1024,
        sortOrder: 1,
        createdAt: "2026-09-03T00:01:00.000Z",
        updatedAt: "2026-09-03T00:01:00.000Z",
      },
    ];

    mockedUseResourceImages.mockReturnValue({
      data: images,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("button", {
        name: "Mover izquierda",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Mover derecha",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Eliminar",
      }),
    ).toBeDisabled();

    expect(
      screen.getByRole("button", {
        name: "Agregar imagen",
      }),
    ).toBeDisabled();
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
