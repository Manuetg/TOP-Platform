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
import { createContact } from "../api/create-contact";
import { CreateContactPage } from "./CreateContactPage";

vi.mock("../api/create-contact", () => ({
  createContact: vi.fn(),
}));

const mockedCreateContact = vi.mocked(createContact);

function renderPage() {
  return render(
    <AuthProvider>
      <MemoryRouter
        initialEntries={["/app/contacts/new"]}
      >
        <Routes>
          <Route
            path="/app/contacts/new"
            element={<CreateContactPage />}
          />
          <Route
            path="/app/contacts/:contactId"
            element={<div>CONTACT DETAIL ROUTE</div>}
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

describe("CreateContactPage", () => {
  beforeEach(() => {
    mockedCreateContact.mockReset();
  });

  it("renders the create form with Paraguay selected by default", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Nuevo contacto",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Nombre/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Apellido/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Teléfono \/ WhatsApp/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText("País"),
    ).toHaveValue("Paraguay");
  });

  it("renders CI and Pasaporte document options", () => {
    renderPage();

    const documentType =
      screen.getByLabelText("Tipo de documento");

    expect(documentType).toHaveTextContent("CI");
    expect(documentType).toHaveTextContent(
      "Pasaporte",
    );
  });

  it("validates required name, last name and phone", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: "Crear contacto",
      }),
    );

    expect(
      await screen.findByText(
        "Ingresá un nombre válido.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Ingresá un apellido válido.",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Ingresá un teléfono válido.",
      ),
    ).toBeInTheDocument();

    expect(
      mockedCreateContact,
    ).not.toHaveBeenCalled();
  });

  it("creates a contact using the unified phone for phone and whatsapp", async () => {
    const user = userEvent.setup();

    mockedCreateContact.mockResolvedValue({
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
    });

    renderPage();

    await user.type(
      screen.getByLabelText(/Nombre/i),
      "Juan",
    );

    await user.type(
      screen.getByLabelText(/Apellido/i),
      "Pérez",
    );

    await user.type(
      screen.getByLabelText(
        /Teléfono \/ WhatsApp/i,
      ),
      "0981123456",
    );

    await user.type(
      screen.getByLabelText("Email"),
      "juan@example.com",
    );

    await user.selectOptions(
      screen.getByLabelText(
        "Tipo de documento",
      ),
      "CI",
    );

    await user.type(
      screen.getByLabelText(
        "Número de documento",
      ),
      "1234567",
    );

    await user.type(
      screen.getByLabelText("Ciudad"),
      "Asunción",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear contacto",
      }),
    );

    await waitFor(() => {
      expect(
        mockedCreateContact,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          input: {
            name: "Juan",
            lastName: "Pérez",
            phone: "0981123456",
            whatsapp: "0981123456",
            email: "juan@example.com",
            documentType: "CI",
            documentNumber: "1234567",
            country: "Paraguay",
            city: "Asunción",
          },
        }),
      );
    });

    expect(
      await screen.findByText(
        "CONTACT DETAIL ROUTE",
      ),
    ).toBeInTheDocument();
  });

  it("maps PASSPORT to Pasaporte for the backend", async () => {
    const user = userEvent.setup();

    mockedCreateContact.mockResolvedValue({
      id: "contact-2",
      businessId: "business-1",
      name: "Ana",
      lastName: "López",
      fullName: "Ana López",
      phone: "0981222333",
      whatsapp: "0981222333",
      email: null,
      documentType: "Pasaporte",
      documentNumber: "PA123456",
      country: "Argentina",
      city: null,
      status: "ACTIVE",
      createdAt: "2026-09-10T00:00:00.000Z",
      updatedAt: "2026-09-10T00:00:00.000Z",
    });

    renderPage();

    await user.type(
      screen.getByLabelText(/Nombre/i),
      "Ana",
    );

    await user.type(
      screen.getByLabelText(/Apellido/i),
      "López",
    );

    await user.type(
      screen.getByLabelText(
        /Teléfono \/ WhatsApp/i,
      ),
      "0981222333",
    );

    await user.selectOptions(
      screen.getByLabelText(
        "Tipo de documento",
      ),
      "PASSPORT",
    );

    await user.type(
      screen.getByLabelText(
        "Número de documento",
      ),
      "PA123456",
    );

    await user.selectOptions(
      screen.getByLabelText("País"),
      "Argentina",
    );

    await user.click(
      screen.getByRole("button", {
        name: "Crear contacto",
      }),
    );

    await waitFor(() => {
      expect(
        mockedCreateContact,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            documentType: "Pasaporte",
            country: "Argentina",
          }),
        }),
      );
    });
  });
});