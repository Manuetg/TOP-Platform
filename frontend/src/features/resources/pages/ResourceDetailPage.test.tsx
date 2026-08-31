import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import { AuthProvider } from "../../auth/context/AuthContext";
import { useResource } from "../queries/use-resource";
import { ResourceDetailPage } from "./ResourceDetailPage";

vi.mock("../queries/use-resource", () => ({
  useResource: vi.fn(),
}));

const mockedUseResource = vi.mocked(useResource);

function renderPage() {
  return render(
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
    </AuthProvider>,
  );
}

describe("ResourceDetailPage", () => {
  it("renders the resource detail", () => {
    mockedUseResource.mockReturnValue({
      data: {
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
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Cabaña Norte",
      }),
    ).toBeInTheDocument();

    expect(screen.getByText("CAB-01")).toBeInTheDocument();
    expect(screen.getByText("Activo")).toBeInTheDocument();
    expect(screen.getByText("Vista al lago")).toBeInTheDocument();
    expect(screen.getByText("Wi-Fi")).toBeInTheDocument();
  });
});
