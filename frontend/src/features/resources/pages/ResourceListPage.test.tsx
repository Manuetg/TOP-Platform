import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { vi } from "vitest";
import { ResourceListPage } from "./ResourceListPage";
import { AuthProvider } from "../../auth/context/AuthContext";
import { useResources } from "../queries/use-resources";

vi.mock("../queries/use-resources", () => ({
  useResources: vi.fn(),
}));

const mockedUseResources = vi.mocked(useResources);

function renderResourceListPage(
  props: ComponentProps<typeof ResourceListPage>,
) {
  return render(
    <AuthProvider>
      <ResourceListPage {...props} />
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
      screen.getByRole("heading", { name: "Creá tu primer recurso" }),
    ).toBeInTheDocument();
  });

  it("renders resource information", () => {
    mockedUseResources.mockReturnValue({
      data: [
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
      ],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderResourceListPage({ businessId: "business-1" });

    expect(
      screen.getByRole("heading", { name: "Cabaña Norte" }),
    ).toBeInTheDocument();

    expect(screen.getByText("CAB-01")).toBeInTheDocument();
    expect(screen.getByText("1–4 huéspedes")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
  });
});
