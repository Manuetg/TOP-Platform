import { within } from "@testing-library/react";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  render,
  act,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { deleteResourceImage } from "../api/delete-resource-image";
import { disableResource } from "../api/disable-resource";
import { reactivateResource } from "../api/reactivate-resource";
import { uploadResourceImage } from "../api/upload-resource-image";
import { useResourceImages } from "../queries/use-resource-images";
import { useResource } from "../queries/use-resource";
import type {
  Resource,
  ResourceImage,
} from "../types/resource.types";
import { ResourceDetailPage } from "./ResourceDetailPage";

const { businessContext } = vi.hoisted(() => ({
  businessContext: {
    activeBusinessId: "business-1",
    activeBusiness: null,
    activeRole: "OWNER" as string | null,
  },
}));
vi.mock("../../business/context/BusinessContext", () => ({
  useBusinessContext: () => businessContext,
}));
vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    status: "authenticated",
    session: {
      accessToken: "resource-detail-test-access",
      user: { id: "user-1", email: "owner@example.test", status: "ACTIVE" },
    },
  }),
}));
vi.mock("../../bookings/queries/use-bookings", () => ({
  useBookings: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));
vi.mock("../../blocks/queries/use-blocks", () => ({
  useBlocks: () => ({ data: [], isLoading: false, isError: false, refetch: vi.fn() }),
}));

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

function CalendarDestination() {
  const location = useLocation();
  const navigate = useNavigate();
  return <><h1>Calendario de prueba</h1><output aria-label="Ruta actual">{location.pathname}{location.search}</output><button onClick={() => void navigate(-1)}>Volver</button></>;
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
        <MemoryRouter
          initialEntries={["/app/resources/resource-1"]}
        >
          <Routes>
            <Route
              path="/app/resources/:resourceId"
              element={<ResourceDetailPage />}
            />
            <Route path="/app/calendar" element={<CalendarDestination />} />
          </Routes>
        </MemoryRouter>
    </QueryClientProvider>,
  );

  return {
    ...result,
    queryClient,
  };
}

describe("ResourceDetailPage", () => {
  beforeEach(() => {
    businessContext.activeRole = "OWNER";
    businessContext.activeBusinessId = "business-1";
    vi.restoreAllMocks();
    mockedUseResource.mockReset();
    mockedUseResourceImages.mockReset();
    mockedDisableResource.mockReset();
    mockedReactivateResource.mockReset();
    mockedUploadResourceImage.mockReset();
    mockedDeleteResourceImage.mockReset();

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
      screen.getByRole("switch", {
        name: "Poner fuera de servicio",
      }),
    ).toBeInTheDocument();
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST"])("mantiene Crear reserva para %s y navega a Calendario sin parámetros inventados; Back recupera el recurso", async (role) => {
    businessContext.activeRole = role;
    mockResource(activeResource);
    const user = userEvent.setup();
    renderPage();
    const create = screen.getByRole("link", { name: "Crear reserva" });
    expect(create).toHaveAttribute("href", "/app/calendar");
    await user.click(create);
    expect(screen.getByRole("heading", { name: "Calendario de prueba" })).toBeInTheDocument();
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent(/^\/app\/calendar$/);
    expect(businessContext.activeBusinessId).toBe("business-1");
    await user.click(screen.getByRole("button", { name: "Volver" }));
    expect(screen.getByRole("heading", { name: activeResource.name })).toBeInTheDocument();
  });

  it("renders the breadcrumb and opens the edit form as a dialog", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    renderPage();

    const breadcrumb = screen.getByRole("navigation", {
      name: "Migas de pan",
    });

    expect(
      within(breadcrumb).getByRole("link", { name: /Inicio/ }),
    ).toHaveAttribute("href", "/app");
    expect(
      within(breadcrumb).getByRole("link", { name: /Recursos/ }),
    ).toHaveAttribute("href", "/app/resources");
    expect(
      within(breadcrumb)
        .getByText(activeResource.name)
        .closest("[aria-current]")
    ).toHaveAttribute("aria-current", "page");

    const actions = screen.getByRole("article", { name: "Acciones" });
    expect(
      within(actions).getByRole("link", {
        name: "Crear reserva",
      }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("link", {
        name: "Consultar disponibilidad",
      }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("link", {
        name: "Crear bloqueo",
      }),
    ).toBeInTheDocument();
    expect(
      within(actions).getByRole("link", {
        name: "Ver pagos por reserva",
      }),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Editar recurso",
      }),
    );

    const dialog = await screen.findByRole("dialog", {
      name: "Editar recurso",
    });

    expect(dialog).toBeVisible();
    expect(
      within(dialog).getByRole("heading", { name: "Editar recurso" }),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", { name: "Cerrar edición" }),
    );

    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Editar recurso" }),
      ).not.toBeInTheDocument();
    });
  });

  it("disables an active resource from the status switch", async () => {
    const user = userEvent.setup();

    mockResource(activeResource);

    const updatedResource: Resource = {
      ...activeResource,
      status: "OUT_OF_SERVICE",
      updatedAt: "2026-08-31T01:00:00.000Z",
    };

    mockedDisableResource.mockResolvedValue(updatedResource);

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
      screen.getByRole("switch", {
        name: "Poner fuera de servicio",
      }),
    );

    await waitFor(() => {
      expect(mockedDisableResource).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: "resource-1",
        accessToken: "resource-detail-test-access",
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

  it("reactivates an out-of-service resource from the status switch", async () => {
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
      screen.getByRole("switch", {
        name: "Reactivar recurso",
      }),
    );

    await waitFor(() => {
      expect(mockedReactivateResource).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: "resource-1",
        accessToken: "resource-detail-test-access",
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

  it("distinguishes an album request error from an empty album and offers retry", async () => {
    const retryImages = vi.fn();
    mockResource(activeResource);

    mockedUseResourceImages.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("No pudimos cargar las imágenes."),
      refetch: retryImages,
    } as never);

    renderPage();

    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar las fotos.");
    expect(screen.queryByText("Imagen del recurso no configurada")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar fotos" }));
    expect(retryImages).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Agregar imagen" })).toBeDisabled();
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
        accessToken: "resource-detail-test-access",
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
        name: "Eliminar imagen",
      }),
    );

    expect(screen.getByRole("dialog", { name: "Eliminar imagen" })).toBeVisible();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar imagen" }));

    await waitFor(() => {
      expect(mockedDeleteResourceImage).toHaveBeenCalledWith({
        businessId: expect.any(String),
        resourceId: activeResource.id,
        imageId: "image-2",
        accessToken: "resource-detail-test-access",
        signal: expect.any(AbortSignal),
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



    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: "Eliminar imagen",
      }),
    );

    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    expect(mockedDeleteResourceImage).not.toHaveBeenCalled();
  });

  it("keeps archived resources readable without mutation controls", () => {
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
      screen.queryByRole("switch", {
        name: "Recurso archivado",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Eliminar imagen",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("button", {
        name: "Agregar imagen",
      }),
    ).not.toBeInTheDocument();
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

  it.each(["RECEPTIONIST", "VIEWER", null])("hides Resource mutations for role %s", (role) => {
    businessContext.activeRole = role;
    mockResource(activeResource);
    renderPage();
    expect(screen.getByRole("heading", { name: activeResource.name })).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar recurso" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Gestionar amenidades" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agregar imagen" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Consultar disponibilidad" })).toHaveAttribute("href", "/app/availability");
    expect(screen.getByRole("link", { name: "Ver pagos por reserva" })).toHaveAttribute("href", "/app/payments");
    if (role === "RECEPTIONIST") {
      expect(screen.getByRole("link", { name: "Crear reserva" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Crear bloqueo" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("link", { name: "Crear reserva" })).not.toBeInTheDocument();
      expect(screen.queryByRole("link", { name: "Crear bloqueo" })).not.toBeInTheDocument();
    }
    expect(mockedDisableResource).not.toHaveBeenCalled();
    expect(mockedUploadResourceImage).not.toHaveBeenCalled();
  });

  it("separates a broken image from an empty album and offers retry", async () => {
    mockResource(activeResource);
    const retryImages = vi.fn();
    const image: ResourceImage = {
      id: "image-1", resourceId: activeResource.id, url: "https://signed.test/broken.jpg",
      mimeType: "image/jpeg", sizeBytes: 100, sortOrder: 0,
      createdAt: activeResource.createdAt, updatedAt: activeResource.updatedAt,
    };
    mockedUseResourceImages.mockReturnValue({ data: [image], isLoading: false, isError: false, refetch: retryImages } as never);
    renderPage();
    fireEvent.error(screen.getByRole("img", { name: activeResource.name }));
    expect(screen.getByText("Esta imagen no está disponible.")).toBeInTheDocument();
    expect(screen.queryByText("Imagen del recurso no configurada")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar imagen" }));
    expect(retryImages).toHaveBeenCalledOnce();
    expect(screen.getByRole("img", { name: activeResource.name })).toHaveAttribute("src", image.url);
  });

  it("keeps the modal keyboard focus contained and returns it on Escape", async () => {
    mockResource(activeResource);
    const user = userEvent.setup();
    renderPage();
    const trigger = screen.getByRole("button", { name: "Editar recurso" });
    await user.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Editar recurso" });
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("does not duplicate a status operation and ignores its late response after unmount", async () => {
    mockResource(activeResource);
    let complete!: (resource: Resource) => void;
    mockedDisableResource.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const { unmount, queryClient } = renderPage();
    const cacheWrite = vi.spyOn(queryClient, "setQueryData");
    const toggle = screen.getByRole("switch", { name: "Poner fuera de servicio" });
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(mockedDisableResource).toHaveBeenCalledOnce();
    expect(toggle).toBeDisabled();
    unmount();
    await act(async () => { complete({ ...activeResource, status: "OUT_OF_SERVICE" }); });
    expect(cacheWrite).not.toHaveBeenCalled();
  });

  it("does not duplicate image deletion before the confirmation rerenders", async () => {
    mockResource(activeResource);
    const image: ResourceImage = {
      id: "image-1", resourceId: activeResource.id, url: "https://signed.test/image-1.jpg",
      mimeType: "image/jpeg", sizeBytes: 100, sortOrder: 0,
      createdAt: activeResource.createdAt, updatedAt: activeResource.updatedAt,
    };
    mockedUseResourceImages.mockReturnValue({ data: [image], isLoading: false, isError: false } as never);
    let complete!: () => void;
    mockedDeleteResourceImage.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    renderPage();
    await userEvent.setup().click(screen.getByRole("button", { name: "Eliminar imagen" }));
    const confirm = within(screen.getByRole("dialog")).getByRole("button", { name: "Eliminar imagen" });
    act(() => { confirm.click(); confirm.click(); });
    expect(mockedDeleteResourceImage).toHaveBeenCalledOnce();
    expect(confirm).toBeDisabled();
    await act(async () => { complete(); });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
