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
import { updateContact } from "../api/update-contact";
import { useContact } from "../queries/use-contact";
import { EditContactPage } from "./EditContactPage";

vi.mock("../queries/use-contact", () => ({
  useContact: vi.fn(),
}));

vi.mock("../api/update-contact", () => ({
  updateContact: vi.fn(),
}));

const mockedUseContact = vi.mocked(useContact);
const mockedUpdateContact = vi.mocked(updateContact);

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
          "/app/contacts/contact-1/edit",
        ]}
      >
        <Routes>
          <Route
            path="/app/contacts/:contactId/edit"
            element={<EditContactPage />}
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

describe("EditContactPage", () => {
  beforeEach(() => {
    mockedUseContact.mockReset();
    mockedUpdateContact.mockReset();
  });

  it("loads the current contact values into the form", async () => {
    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      await screen.findByLabelText(/Nombre/i),
    ).toHaveValue("Juan");

    expect(
      screen.getByLabelText(/Apellido/i),
    ).toHaveValue("Pérez");

    expect(
      screen.getByLabelText(
        /Teléfono \/ WhatsApp/i,
      ),
    ).toHaveValue("0981123456");

    expect(
      screen.getByLabelText("Email"),
    ).toHaveValue("juan@example.com");

    expect(
      screen.getByLabelText(
        "Tipo de documento",
      ),
    ).toHaveValue("CI");

    expect(
      screen.getByLabelText("País"),
    ).toHaveValue("Paraguay");
  });

  it("maps a persisted Pasaporte value to PASSPORT in the form", async () => {
    mockedUseContact.mockReturnValue({
      data: {
        ...contact,
        documentType: "Pasaporte",
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    expect(
      await screen.findByLabelText(
        "Tipo de documento",
      ),
    ).toHaveValue("PASSPORT");
  });

  it("updates the contact and keeps phone and whatsapp unified", async () => {
    const user = userEvent.setup();

    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    mockedUpdateContact.mockResolvedValue({
      ...contact,
      lastName: "Gómez",
      fullName: "Juan Gómez",
      phone: "+595981555555",
      whatsapp: "+595981555555",
      country: "Argentina",
      city: "Buenos Aires",
      updatedAt: "2026-09-10T01:00:00.000Z",
    });

    renderPage();

    const lastName =
      await screen.findByLabelText(/Apellido/i);

    await user.clear(lastName);
    await user.type(lastName, "Gómez");

    const phone = screen.getByLabelText(
      /Teléfono \/ WhatsApp/i,
    );

    await user.clear(phone);
    await user.type(phone, "+595981555555");

    await user.selectOptions(
      screen.getByLabelText("País"),
      "Argentina",
    );

    const city =
      screen.getByLabelText("Ciudad");

    await user.clear(city);
    await user.type(city, "Buenos Aires");

    await user.click(
      screen.getByRole("button", {
        name: "Guardar cambios",
      }),
    );

    await waitFor(() => {
      expect(
        mockedUpdateContact,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          contactId: "contact-1",
          input: expect.objectContaining({
            name: "Juan",
            lastName: "Gómez",
            phone: "+595981555555",
            whatsapp: "+595981555555",
            country: "Argentina",
            city: "Buenos Aires",
          }),
        }),
      );
    });

    expect(
      await screen.findByText(
        "CONTACT DETAIL ROUTE",
      ),
    ).toBeInTheDocument();
  });

  it("does not submit when a required field is empty", async () => {
    const user = userEvent.setup();

    mockedUseContact.mockReturnValue({
      data: contact,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    } as never);

    renderPage();

    const phone =
      await screen.findByLabelText(
        /Teléfono \/ WhatsApp/i,
      );

    await user.clear(phone);

    await user.click(
      screen.getByRole("button", {
        name: "Guardar cambios",
      }),
    );

    expect(
      await screen.findByText(
        "Ingresa un teléfono válido con país o prefijo internacional.",
      ),
    ).toBeInTheDocument();

    expect(
      mockedUpdateContact,
    ).not.toHaveBeenCalled();
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
  it("preserva teléfonos históricos distintos al editar otro campo", async () => {
    const user = userEvent.setup();
    mockedUseContact.mockReturnValue({ data: { ...contact, phone: "interno 12", whatsapp: "0981999" }, isLoading: false, isError: false, error: null, refetch: vi.fn() } as never);
    mockedUpdateContact.mockResolvedValue(contact); renderPage();
    const country = screen.getByLabelText("País");
    const phone = screen.getByLabelText(/Teléfono \/ WhatsApp/i);
    expect(country.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(country.closest("section")).toBe(phone.closest("section"));
    await user.selectOptions(country, "Argentina");
    expect(screen.getByLabelText("Prefijo internacional")).toHaveTextContent("+54");
    expect(phone).toHaveValue("interno 12");
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockedUpdateContact).toHaveBeenCalledOnce());
    expect(mockedUpdateContact.mock.calls[0][0].input).not.toHaveProperty("phone");
    expect(mockedUpdateContact.mock.calls[0][0].input).not.toHaveProperty("whatsapp");
  });
  it("permite editar un contacto legado solo con email sin inventar teléfono", async () => {
    const user = userEvent.setup(); mockedUseContact.mockReturnValue({ data: { ...contact, lastName: null, phone: null, whatsapp: null }, isLoading: false, isError: false, error: null, refetch: vi.fn() } as never);
    mockedUpdateContact.mockResolvedValue(contact); renderPage();
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(mockedUpdateContact).toHaveBeenCalledOnce());
    expect(mockedUpdateContact.mock.calls[0][0].input).not.toHaveProperty("phone");
    expect(mockedUpdateContact.mock.calls[0][0].input).toMatchObject({ lastName: null, email: contact.email });
  });

});
