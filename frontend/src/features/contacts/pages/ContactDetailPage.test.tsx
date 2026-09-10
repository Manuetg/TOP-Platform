import {
  render,
  screen,
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
import { useContact } from "../queries/use-contact";
import { ContactDetailPage } from "./ContactDetailPage";

vi.mock("../queries/use-contact", () => ({
  useContact: vi.fn(),
}));

const mockedUseContact = vi.mocked(useContact);

const contact = {
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
} as const;

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter
        initialEntries={[
          "/app/contacts/contact-1",
        ]}
      >
        <Routes>
          <Route
            path="/app/contacts/:contactId"
            element={<ContactDetailPage />}
          />
          <Route
            path="/app/contacts/:contactId/edit"
            element={<div>EDIT CONTACT ROUTE</div>}
          />
          <Route
            path="/app/contacts"
            element={<div>CONTACT LIST ROUTE</div>}
          />
        </Routes>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ContactDetailPage", () => {
  beforeEach(() => {
    mockedUseContact.mockReset();
  });

  it("renders the contact detail", () => {
    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Juan Pérez",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Activo"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("1234567"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("0981123456"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("juan@example.com"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Paraguay"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Asunción"),
    ).toBeInTheDocument();
  });

  it("shows the loading state", () => {
    mockedUseContact.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      screen.getByText("Cargando contacto"),
    ).toBeInTheDocument();
  });

  it("shows the error state and retries", async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();

    mockedUseContact.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error(
        "No pudimos cargar el contacto.",
      ),
      refetch,
    } as never);

    renderPage();

    expect(
      screen.getByText(
        "No pudimos cargar el contacto.",
      ),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: "Reintentar",
      }),
    );

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("navigates to edit contact", async () => {
    const user = userEvent.setup();

    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: /Editar/i,
      }),
    );

    expect(
      screen.getByText("EDIT CONTACT ROUTE"),
    ).toBeInTheDocument();
  });

  it("navigates back to contacts", async () => {
    const user = userEvent.setup();

    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: "Contactos",
      }),
    );

    expect(
      screen.getByText("CONTACT LIST ROUTE"),
    ).toBeInTheDocument();
  });
});