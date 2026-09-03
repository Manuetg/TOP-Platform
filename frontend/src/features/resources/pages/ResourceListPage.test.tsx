import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { ResourceListPage } from "./ResourceListPage";
import { AuthProvider } from "../../auth/context/AuthContext";
import { useResources } from "../queries/use-resources";

vi.mock("../queries/use-resources", () => ({
  useResources: vi.fn(),
}));

const mockedUseResources = vi.mocked(useResources);

const filterableResources = [
  {
    id: "resource-1",
    businessId: "business-1",
    name: "Cabaña Norte",
    internalCode: "CAB-01",
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 4,
    capacityMaximumChildren: 2,
    status: "ACTIVE",
    sortOrder: 1,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    amenities: [],
  },
  {
    id: "resource-2",
    businessId: "business-1",
    name: "Suite Jardín",
    internalCode: "SUI-02",
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 2,
    capacityMaximumChildren: 1,
    status: "OUT_OF_SERVICE",
    sortOrder: 2,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    amenities: [],
  },
  {
    id: "resource-3",
    businessId: "business-1",
    name: "Loft Río",
    internalCode: "LOFT-03",
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 3,
    capacityMaximumChildren: 1,
    status: "ARCHIVED",
    sortOrder: 3,
    createdAt: "2026-08-28T00:00:00.000Z",
    updatedAt: "2026-08-28T00:00:00.000Z",
    amenities: [],
  },
] as const;

function renderResourceListPage(
  props: ComponentProps<typeof ResourceListPage>,
) {
  return render(
    <AuthProvider>
      <MemoryRouter>
        <ResourceListPage {...props} />
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ResourceListPage", () => {
  it("shows the development configuration state without a business id", () => {
    mockedUseResources.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "" });

    expect(
      screen.getByText(/VITE_DEV_BUSINESS_ID/i),
    ).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    mockedUseResources.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent("Cargando recursos");
  });

  it("shows the empty state", () => {
    mockedUseResources.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    expect(
      screen.getByRole("heading", {
        name: "Creá tu primer recurso",
      }),
    ).toBeInTheDocument();
  });

  it("renders resource information", () => {
    mockedUseResources.mockReturnValue({
      data: [filterableResources[0]],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    expect(
      screen.getByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("CAB-01")).toBeInTheDocument();
    expect(
      screen.getByText("1–4 huéspedes"),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText("Activo"),
    ).toHaveLength(2);
  });

  it("filters resources by name", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
      "jardín",
    );

    expect(
      screen.getByRole("heading", {
        name: "Suite Jardín",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Loft Río",
      }),
    ).not.toBeInTheDocument();
  });

  it("filters resources by internal code case-insensitively", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
      "loft-03",
    );

    expect(
      screen.getByRole("heading", {
        name: "Loft Río",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).not.toBeInTheDocument();
  });

  it("filters resources by status", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Estado",
      }),
      "OUT_OF_SERVICE",
    );

    expect(
      screen.getByRole("heading", {
        name: "Suite Jardín",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).not.toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Loft Río",
      }),
    ).not.toBeInTheDocument();
  });

  it("combines search and status filters", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
      "suite",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Estado",
      }),
      "ACTIVE",
    );

    expect(
      screen.getByRole("heading", {
        name: "No encontramos recursos",
      }),
    ).toBeInTheDocument();
  });

  it("shows a specific empty state when filters have no matches", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
      "inexistente",
    );

    expect(
      screen.getByRole("heading", {
        name: "No encontramos recursos",
      }),
    ).toBeInTheDocument();

    expect(
      screen.queryByRole("heading", {
        name: "Creá tu primer recurso",
      }),
    ).not.toBeInTheDocument();
  });

  it("clears active filters and restores all resources", async () => {
    const user = userEvent.setup();

    mockedUseResources.mockReturnValue({
      data: filterableResources,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    await user.type(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
      "suite",
    );

    await user.selectOptions(
      screen.getByRole("combobox", {
        name: "Estado",
      }),
      "OUT_OF_SERVICE",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Limpiar filtros",
      }),
    );

    expect(
      screen.getByRole("searchbox", {
        name: "Buscar recurso",
      }),
    ).toHaveValue("");

    expect(
      screen.getByRole("combobox", {
        name: "Estado",
      }),
    ).toHaveValue("ALL");

    expect(
      screen.getByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Suite Jardín",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "Loft Río",
      }),
    ).toBeInTheDocument();
  });
});
