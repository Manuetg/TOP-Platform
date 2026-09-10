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
import { useContacts } from "../queries/use-contacts";
import { ContactListPage } from "./ContactListPage";

vi.mock("../queries/use-contacts", () => ({
  useContacts: vi.fn(),
}));

const mockedUseContacts = vi.mocked(useContacts);

const contacts = [
  {
    id: "contact-1",
    businessId: "business-1",
    name: "Juan",
    lastName: "Pérez",
    fullName: "Juan Pérez",
    phone: "0981123456",
    whatsapp: "0981123456",
    email: "juan@example.com",
    documentType: "CI",
    documentNumber: "1234567",
    country: "Paraguay",
    city: "Asunción",
    status: "ACTIVE",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
  },
] as const;

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter initialEntries={["/app/contacts"]}>
        <Routes>
          <Route
            path="/app/contacts"
            element={
              <ContactListPage businessId="business-1" />
            }
          />
          <Route
            path="/app/contacts/new"
            element={<div>CREATE CONTACT ROUTE</div>}
          />
          <Route
            path="/app/contacts/:contactId"
            element={<div>DETAIL CONTACT ROUTE</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ContactListPage", () => {
  beforeEach(() => {
    mockedUseContacts.mockReset();
  });

  it("renders the contacts list", () => {
    mockedUseContacts.mockReturnValue({
      data: contacts,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Contactos",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getAllByText("Juan Pérez").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("juan@example.com").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("0981123456").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("Activo").length,
    ).toBeGreaterThan(0);
  });

  it("shows the empty state", () => {
    mockedUseContacts.mockReturnValue({
      data: [],
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByText(/No hay contactos|primer contacto/i),
    ).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    mockedUseContacts.mockReturnValue({
      data: undefined,
      isLoading: true,
      isFetching: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByText(/Cargando contactos/i),
    ).toBeInTheDocument();
  });

  it("shows the error state and retries", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    mockedUseContacts.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error(
        "No pudimos cargar los contactos.",
      ),
      refetch,
    } as never);

    renderPage();

    expect(
      screen.getByText(
        "No pudimos cargar los contactos.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /Reintentar/i,
      }),
    );

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("sends the debounced search query to useContacts", async () => {
    const user = userEvent.setup();

    mockedUseContacts.mockReturnValue({
      data: contacts,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    const search = screen.getByRole("searchbox");

    await user.type(search, "Juan");

    await waitFor(
      () => {
        expect(
          mockedUseContacts,
        ).toHaveBeenLastCalledWith(
          expect.objectContaining({
            businessId: "business-1",
            query: "Juan",
          }),
        );
      },
      {
        timeout: 1000,
      },
    );
  });

  it("navigates to create contact", async () => {
    const user = userEvent.setup();

    mockedUseContacts.mockReturnValue({
      data: contacts,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: /Nuevo contacto/i,
      }),
    );

    expect(
      screen.getByText("CREATE CONTACT ROUTE"),
    ).toBeInTheDocument();
  });
});