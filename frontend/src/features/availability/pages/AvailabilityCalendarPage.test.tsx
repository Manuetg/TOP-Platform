import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
  useLocation,
} from "react-router-dom";
import {
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AvailabilityCalendarPage } from "./AvailabilityCalendarPage";
import { createContact } from "../../contacts/api/create-contact";

function LocationProbe() { const location = useLocation(); return <output aria-label="Ruta actual">{location.pathname} {location.state?.confirmationError}</output>; }

const context = vi.hoisted(() => ({ businessId: "business-1", role: "OWNER" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeRole: context.role, activeBusinessId: context.businessId, activeBusiness: { id: context.businessId, timezone: "America/Asuncion", currency: "PYG" } }) }));
const useResourcesMock = vi.fn();
const useBookingsMock = vi.fn();
const useBlocksMock = vi.fn();
const useContactsMock = vi.fn();
const useAvailabilityCalendarMock = vi.fn();
const useSelectableRatePlansMock = vi.fn();
const useCalculatePriceMock = vi.fn();
const createBookingMock = vi.fn();
const submitBookingMock = vi.fn();
const createPendingBookingMock = vi.fn();
const confirmBookingMock = vi.fn();

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
      user: { id: "user-1" },
    },
  }),
}));

vi.mock("../../resources/queries/use-resources", () => ({
  useResources: (...args: unknown[]) =>
    useResourcesMock(...args),
}));

vi.mock("../../bookings/queries/use-bookings", () => ({
  useBookings: (...args: unknown[]) =>
    useBookingsMock(...args),
}));

vi.mock("../../blocks/queries/use-blocks", () => ({
  useBlocks: (...args: unknown[]) =>
    useBlocksMock(...args),
}));

vi.mock("../../contacts/queries/use-contacts", () => ({
  useContacts: (...args: unknown[]) =>
    useContactsMock(...args),
}));

vi.mock("../queries/use-availability-calendar", () => ({
  useAvailabilityCalendar: (...args: unknown[]) =>
    useAvailabilityCalendarMock(...args),
}));

vi.mock("../../pricing/queries/use-selectable-rate-plans", () => ({
  useSelectableRatePlans: (...args: unknown[]) =>
    useSelectableRatePlansMock(...args),
}));

vi.mock("../../pricing/queries/use-calculate-price", () => ({
  useCalculatePrice: (...args: unknown[]) =>
    useCalculatePriceMock(...args),
}));

vi.mock("../../contacts/api/create-contact", () => ({
  createContact: vi.fn(),
}));

vi.mock("../../bookings/api/create-booking", () => ({
  createBooking: (...args: unknown[]) => createBookingMock(...args),
}));

vi.mock("../../bookings/api/submit-booking", () => ({
  submitBooking: (...args: unknown[]) => submitBookingMock(...args),
}));

vi.mock("../../bookings/api/confirm-booking", () => ({
  confirmBooking: (...args: unknown[]) => confirmBookingMock(...args),
}));
vi.mock("../../bookings/api/create-pending-booking", () => ({
  createPendingBooking: (...args: unknown[]) => createPendingBookingMock(...args),
}));

const resource = {
  id: "resource-1",
  businessId: "business-1",
  name: "Habitacion 1",
  status: "ACTIVE",
  sortOrder: 1,
  capacityMaximum: 4,
};

const contact = {
  id: "contact-1",
  businessId: "business-1",
  name: "Ema",
  lastName: "Bietros",
  fullName: "Ema Bietros",
  phone: "0981123456",
  whatsapp: "0981123456",
  email: null,
  documentType: "CI",
  documentNumber: "1231231",
  country: "Paraguay",
  city: null,
  status: "ACTIVE",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-01T00:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  const tree = () => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/calendar"]}><LocationProbe />
        <AvailabilityCalendarPage />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, rerenderPage: () => view.rerender(tree()) };
}

function wizardQueries() {
  return within(screen.getByRole("dialog", { name: "Nueva reserva" }));
}

function wizardQueries() { return within(screen.getByRole("dialog", { name: "Nueva reserva" })); }

async function goToRateStep() {
  const user = await goToContactStep();
  await user.click(wizardQueries().getByRole("button", { name: /Ema Bietros/i }));
  await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
  return user;
}

async function openWizard() {
  const user = userEvent.setup();

  renderPage();

  await user.click(
    screen.getByRole("button", {
      name: /Nueva reserva/i,
    }),
  );

  return user;
}

async function goToContactStep() {
  const user = await openWizard();

  fireEvent.change(
    wizardQueries().getByLabelText("Entrada"),
    {
      target: {
        value: "2026-09-17",
      },
    },
  );

  await user.click(
    wizardQueries().getByRole("button", {
      name: /Buscar disponibilidad/i,
    }),
  );

  await user.click(
    wizardQueries().getByRole("button", {
      name: /Habitacion 1/i,
    }),
  );

  await user.click(
    wizardQueries().getByRole("button", {
      name: /Continuar/i,
    }),
  );

  return user;
}

describe("AvailabilityCalendarPage", () => {
  it("ubica país antes del teléfono compuesto y actualiza el prefijo internacional", async () => {
    const user = await goToContactStep();
    const wizard = wizardQueries();
    await user.click(wizard.getByRole("button", { name: "Crear contacto" }));
    const country = wizard.getByLabelText("País");
    const phone = wizard.getByLabelText("Teléfono");
    expect(country.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.selectOptions(country, "Argentina");
    expect(wizard.getByLabelText("Prefijo internacional")).toHaveTextContent("+54");
    expect(createContact).not.toHaveBeenCalled();
  });

  it("crea contacto conservando el payload normalizado del teléfono compuesto", async () => {
    vi.mocked(createContact).mockResolvedValue({ ...contact, status: "ACTIVE" });
    const user = await goToContactStep();
    const wizard = wizardQueries();
    await user.click(wizard.getByRole("button", { name: "Crear contacto" }));
    await user.selectOptions(wizard.getByLabelText("País"), "Argentina");
    await user.type(wizard.getByLabelText("Nombre"), "Ana");
    await user.type(wizard.getByLabelText("Apellido"), "Prueba");
    await user.type(wizard.getByLabelText("Teléfono"), "11 2345 6789");
    await user.click(wizard.getByRole("button", { name: "Crear contacto" }));
    await waitFor(() => expect(createContact).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "business-1", input: expect.objectContaining({ name: "Ana", lastName: "Prueba", country: "Argentina", phone: "+541123456789", whatsapp: "+541123456789" }),
    })));
  });

  beforeEach(() => {
    context.businessId = "business-1";
    context.role = "OWNER";
    vi.clearAllMocks();

    useResourcesMock.mockReturnValue({
      data: [resource],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });

    useBookingsMock.mockReturnValue({
      data: [],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });

    useBlocksMock.mockReturnValue({
      data: [],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });

    useContactsMock.mockReturnValue({
      data: [contact],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });

    useAvailabilityCalendarMock.mockImplementation(
      (options: {
        enabled?: boolean;
      }) => {
        if (options?.enabled) {
          return {
            data: {
              resources: [
                {
                  resourceId: "resource-1",
                  days: [
                    {
                      date: "2026-09-17",
                      status: "AVAILABLE",
                    },
                  ],
                },
              ],
            },
            isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
            isError: false,
            error: null,
          };
        }

        return {
          data: {
            resources: [
              {
                resourceId: "resource-1",
                days: [],
              },
            ],
          },
          isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
          isError: false,
          error: null,
        };
      },
    );

    useSelectableRatePlansMock.mockReturnValue({
      data: [
        {
          id: "rate-plan-1",
          name: "Tarifa Normal",
          currency: "PYG",
          baseNightlyAmountMinor: 6500000,
        },
      ],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });

    useCalculatePriceMock.mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        currency: "PYG",
        nights: 1,
        totalAmountMinor: 6500000,
      }),
      isPending: false,
    });

    createBookingMock.mockResolvedValue({ id: "booking-1" });
    submitBookingMock.mockResolvedValue(undefined);
    createPendingBookingMock.mockReset().mockResolvedValue({ id: "booking-1", status: "PENDING" });
    confirmBookingMock.mockResolvedValue(undefined);
  });

  it("renders the calendar with independent month and year controls", async () => {
    const user = userEvent.setup();

    renderPage();

    expect(
      screen.getByRole("heading", {
        name: "Calendario",
      }),
    ).toBeInTheDocument();

    const monthSelect =
      screen.getByLabelText("Mes") as HTMLSelectElement;

    const yearSelect =
      screen.getByLabelText("Año") as HTMLSelectElement;

    const nextMonth =
      monthSelect.value === "0" ? "1" : "0";

    const nextYear = String(
      Number(yearSelect.value) + 1,
    );

    await user.selectOptions(
      monthSelect,
      nextMonth,
    );

    expect(monthSelect).toHaveValue(nextMonth);

    await user.selectOptions(
      yearSelect,
      nextYear,
    );

    expect(yearSelect).toHaveValue(nextYear);
  });

  it.each(["OWNER", "ADMIN", "RECEPTIONIST"])("permite iniciar el asistente desde Calendario para %s", async (role) => {
    context.role = role;
    await openWizard();
    expect(screen.getByRole("dialog", { name: "Nueva reserva" })).toBeVisible();
    expect(screen.getByLabelText("Entrada")).toHaveValue("");
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("VIEWER consulta calendario y reservas sin iniciar creación desde cabecera, agenda ni celdas libres", async () => {
    context.role = "VIEWER";
    useAvailabilityCalendarMock.mockReturnValue({
      data: { resources: [{ resourceId: "resource-1", days: [{ date: "2026-09-01", status: "AVAILABLE" }] }] },
      isSuccess: true, isFetching: false, isLoading: false, isError: false, refetch: vi.fn(),
    });
    useBookingsMock.mockReturnValue({
      data: [{ id: "existing-booking", resourceIds: ["resource-1"], status: "CONFIRMED", checkInDate: "2026-09-02", checkOutDate: "2026-09-03" }],
      isSuccess: true, isFetching: false, isLoading: false, isError: false, refetch: vi.fn(),
    });
    const user = userEvent.setup();
    renderPage();
    fireEvent.change(screen.getByLabelText("Año"), { target: { value: "2026" } });
    fireEvent.change(screen.getByLabelText("Mes"), { target: { value: "8" } });
    expect(screen.getByRole("heading", { name: "Calendario" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reserva" })).not.toBeInTheDocument();
    const freeDay = screen.getByRole("button", { name: /^(Disponible el|Crear reserva para) 01\/09\/2026$/ });
    expect(freeDay).toBeDisabled();
    await user.click(freeDay);
    await user.click(screen.getByText("Sin movimientos"));
    expect(screen.queryByRole("dialog", { name: "Nueva reserva" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Abrir reserva Confirmada del 02\/09\/2026$/ }));
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/app/bookings/existing-booking");
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(submitBookingMock).not.toHaveBeenCalled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
  });

  it("retira el asistente al perder permiso operativo sin reabrir un borrador automáticamente", async () => {
    const user = userEvent.setup();
    const view = renderPage();
    await user.click(screen.getByRole("button", { name: "Nueva reserva" }));
    fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: "2026-09-17" } });
    context.role = "VIEWER";
    view.rerenderPage();
    expect(screen.queryByRole("dialog", { name: "Nueva reserva" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Nueva reserva" })).not.toBeInTheDocument();
    context.role = "OWNER";
    view.rerenderPage();
    expect(screen.queryByRole("dialog", { name: "Nueva reserva" })).not.toBeInTheDocument();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
  });

  it("hides Back on step 1 and sets checkout to the next day", async () => {
    await openWizard();

    expect(
      screen.queryByRole("button", {
        name: /Atrás/i,
      }),
    ).not.toBeInTheDocument();

    const checkIn =
      wizardQueries().getByLabelText("Entrada");

    const checkOut =
      wizardQueries().getByLabelText("Salida") as HTMLInputElement;

    fireEvent.change(checkIn, {
      target: {
        value: "2026-09-17",
      },
    });

    expect(checkOut).toHaveValue(
      "2026-09-18",
    );

    expect(
      wizardQueries().getByText("17/09/2026"),
    ).toBeInTheDocument();

    expect(
      wizardQueries().getByText("18/09/2026"),
    ).toBeInTheDocument();
  });

  it("shows the selected contact only once", async () => {
    const user = await goToContactStep();

    await user.click(
      wizardQueries().getByRole("button", {
        name: /Ema Bietros/i,
      }),
    );

    expect(
      screen.getAllByText("Ema Bietros"),
    ).toHaveLength(1);

    expect(
      wizardQueries().getByText(
        /CI · 1231231 · 0981123456/i,
      ),
    ).toBeInTheDocument();
  });

  it("automatically selects the only valid rate plan", async () => {
    const user = await goToContactStep();

    await user.click(
      wizardQueries().getByRole("button", {
        name: /Ema Bietros/i,
      }),
    );

    await user.click(
      wizardQueries().getByRole("button", {
        name: /Continuar/i,
      }),
    );

    await waitFor(() => {
      expect(
        wizardQueries().getByRole("button", {
          name: /Tarifa Normal/i,
        }),
      ).toHaveClass("is-selected");
    });
  });

  it("formats a manual amount as guaranies", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    const input = wizardQueries().getByLabelText("Precio final");
    await user.type(input, "600000");
    await user.tab();
    expect(input).toHaveValue("600.000");
  });

  it("hides configured rate-plan cards in manual mode", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("button", { name: /Tarifa Normal/i })).not.toBeInTheDocument();
    expect(wizardQueries().queryByLabelText("Plan de referencia")).not.toBeInTheDocument();
  });

  it("no muestra referencia con varios planes en modo Manual", async () => {
    useSelectableRatePlansMock.mockReturnValue({
      data: [
        { id: "rate-plan-1", name: "Tarifa Normal", currency: "PYG", baseNightlyAmountMinor: 6500000 },
        { id: "rate-plan-2", name: "Tarifa Flexible", currency: "PYG", baseNightlyAmountMinor: 7000000 },
      ],
      isSuccess: true,
      isFetching: false,
      refetch: vi.fn(),
      isLoading: false,
      isError: false,
    });
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("button", { name: /Tarifa Normal/i })).not.toBeInTheDocument();
    expect(wizardQueries().queryByLabelText("Plan de referencia")).not.toBeInTheDocument();
    expect(wizardQueries().getByRole("button", { name: "Manual" })).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps configured rate-plan cards visible in configured mode", async () => {
    await goToRateStep();
    expect(wizardQueries().getByRole("button", { name: /Tarifa Normal/i })).toBeInTheDocument();
  });

  it("does not calculate a preview before continuing in manual mode", async () => {
    const user = await goToRateStep();
    const calculate = useCalculatePriceMock.mock.results[0]?.value.mutateAsync as ReturnType<typeof vi.fn>;
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    await user.type(wizardQueries().getByLabelText("Precio final"), "600000");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    expect(calculate).not.toHaveBeenCalled();
  });

  it("crea Pendiente con precio manual y datos completos en una sola operación", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    await user.type(wizardQueries().getByLabelText("Precio final"), "600000");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "business-1", input: {
        contactId: "contact-1", resourceIds: ["resource-1"], checkInDate: "2026-09-17", checkOutDate: "2026-09-18", adults: 2, children: 0,
        pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 600000, overrideReason: "Acuerdo directo" }],
      },
    })));
    expect(createPendingBookingMock).toHaveBeenCalledOnce();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(submitBookingMock).not.toHaveBeenCalled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/app/bookings/booking-1"));
  });

  it("keeps configured pricing unchanged without a discount", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    expect(wizardQueries().getByText(/La reserva quedará Pendiente/)).toBeVisible();
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.not.objectContaining({ agreedAmountMinor: expect.anything(), overrideReason: expect.anything() })] }) })));
  });

  it("usa el Business activo en todas las lecturas y en la confirmación", async () => {
    context.businessId = "business-selected";
    try {
      const user = await goToRateStep();
      for (const hook of [useResourcesMock, useBookingsMock, useBlocksMock, useContactsMock, useAvailabilityCalendarMock, useSelectableRatePlansMock, useCalculatePriceMock]) {
        expect(hook).toHaveBeenLastCalledWith(expect.objectContaining({ businessId: "business-selected" }));
      }
      await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
      await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
      await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-selected" })));
    } finally { context.businessId = "business-1"; }
  });

  it("cerrar durante el alta aborta la señal y una respuesta tardía no continúa Submit/Confirm", async () => {
    let resolve!: (value: { id: string }) => void;
    createPendingBookingMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const user = await goToRateStep(); await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.dblClick(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    expect(createPendingBookingMock).toHaveBeenCalledTimes(1);
    const signal: AbortSignal = createPendingBookingMock.mock.calls[0][0].signal;
    await user.click(wizardQueries().getByRole("button", { name: "Cerrar" })); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ id: "late-booking" }));
    expect(submitBookingMock).not.toHaveBeenCalled(); expect(confirmBookingMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/app/calendar");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el asistente compartido contiene Tab y Escape devuelve foco al disparador", async () => {
    const user = await openWizard();
    expect(screen.getByRole("dialog", { name: "Nueva reserva" })).toHaveFocus();
    await user.tab({ shift: true }); expect(wizardQueries().getByRole("button", { name: /Buscar disponibilidad/ })).toHaveFocus();
    await user.tab(); expect(wizardQueries().getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nueva reserva/ })).toHaveFocus();
  });

  it("applies a 10 percent configured discount in exact minor units", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Aplicar descuento" }));
    await user.click(wizardQueries().getByRole("button", { name: "10%" }));
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.objectContaining({ agreedAmountMinor: 5850000, overrideReason: "Descuento del 10% aplicado desde calendario" })] }) })));
  });

  it("removes the discount and restores the configured price", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Aplicar descuento" }));
    await user.click(wizardQueries().getByRole("button", { name: "10%" }));
    await user.click(wizardQueries().getByRole("button", { name: "Quitar descuento" }));
    expect(wizardQueries().queryByText(/Descuento \(10%\)/i)).not.toBeInTheDocument();
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.not.objectContaining({ agreedAmountMinor: expect.anything(), overrideReason: expect.anything() })] }) })));
  });
  it("no mezcla descuento configurado con el payload Manual al alternar", async () => {
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Aplicar descuento" }));
    await user.click(wizardQueries().getByRole("button", { name: "10%" }));
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("button", { name: "Aplicar descuento" })).not.toBeInTheDocument();
    await user.type(wizardQueries().getByLabelText("Precio final"), "450000");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] }) })));
  });
  it("no ofrece Manual ni permite continuar sin planes para RECEPTIONIST", async () => {
    context.role = "RECEPTIONIST";
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    await goToRateStep();
    expect(wizardQueries().getByText("No hay un tarifario disponible para esta estadía.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
  });
  it("no ofrece override ni descuento a RECEPTIONIST", async () => {
    context.role = "RECEPTIONIST"; await goToRateStep();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar descuento" })).not.toBeInTheDocument();
  });
  it("no presenta vacío durante carga ni después de error y permite reintentar", async () => {
    const retry = vi.fn(); useSelectableRatePlansMock.mockReturnValue({ data: undefined, isSuccess: false, isLoading: true, isFetching: true, isError: false, refetch: retry });
    const user = await goToRateStep(); expect(wizardQueries().getByText("Buscando planes tarifarios…")).toBeVisible();
    expect(wizardQueries().queryByText("No hay un tarifario disponible para esta estadía.")).not.toBeInTheDocument();
    useSelectableRatePlansMock.mockReturnValue({ data: undefined, isSuccess: false, isLoading: false, isFetching: false, isError: true, refetch: retry });
    await user.click(wizardQueries().getByRole("button", { name: /Atrás/i })); await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    expect(wizardQueries().getByText("No pudimos consultar los tarifarios de esta estadía.")).toBeVisible();
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled(); await user.click(wizardQueries().getByRole("button", { name: "Reintentar tarifarios" })); expect(retry).toHaveBeenCalledOnce();
  });
  it("el cambio de fechas descarta una tarifa previamente seleccionada", async () => {
    const user = await goToRateStep(); expect(wizardQueries().getByRole("button", { name: /Tarifa Normal/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(wizardQueries().getByRole("button", { name: /Atrás/i })); await user.click(wizardQueries().getByRole("button", { name: /Atrás/i })); await user.click(wizardQueries().getByRole("button", { name: /Atrás/i }));
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    fireEvent.change(wizardQueries().getByLabelText("Entrada"), { target: { value: "2026-09-18" } }); fireEvent.change(wizardQueries().getByLabelText("Salida"), { target: { value: "2026-09-20" } });
    await user.click(wizardQueries().getByRole("button", { name: /Buscar disponibilidad/i })); await user.click(wizardQueries().getByRole("button", { name: /Habitacion 1/i })); await user.click(wizardQueries().getByRole("button", { name: /Continuar/i })); await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    expect(wizardQueries().getByText("No hay un tarifario disponible para esta estadía.")).toBeVisible(); expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
  });

  it.each(["OWNER", "ADMIN"])("confirma precio excepcional sin tarifario para %s", async (role) => {
    context.role = role;
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    fireEvent.change(wizardQueries().getByLabelText("Precio final"), { target: { value: "350.000" } });
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
    fireEvent.change(wizardQueries().getByLabelText("Motivo del precio manual"), { target: { value: "Acuerdo directo" } });
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    expect(wizardQueries().getByText("Precio manual")).toBeVisible(); expect(wizardQueries().getByText("Acuerdo directo")).toBeVisible();
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 350000, overrideReason: "Acuerdo directo" }] }) })));
  });
  it.each([1, 2])("confirma Manual con %s tarifario(s) sin ratePlanId", async (count) => {
    useSelectableRatePlansMock.mockReturnValue({ data: Array.from({ length: count }, (_, index) => ({ id: `plan-${index + 1}`, name: `Tarifa ${index + 1}`, currency: "PYG", baseNightlyAmountMinor: 500000 })), isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    expect(wizardQueries().queryByLabelText("Plan de referencia")).not.toBeInTheDocument();
    await user.type(wizardQueries().getByLabelText("Precio final"), "450.000");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] }) })));
  });
  it.each(["carga", "error", "refetch"])("Manual sigue disponible durante %s de tarifarios", async (status) => {
    useSelectableRatePlansMock.mockReturnValue({ data: status === "refetch" ? [{ id: "plan-1", name: "Tarifa", currency: "PYG", baseNightlyAmountMinor: 500000 }] : undefined, isSuccess: status === "refetch", isLoading: status === "carga", isFetching: status !== "error", isError: status === "error", refetch: vi.fn() });
    const user = await goToRateStep();
    await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    const input = wizardQueries().getByLabelText("Precio final");
    expect(input.parentElement?.querySelector(".top-input-prefix__value")).toHaveTextContent("₲");
    expect(input).toHaveAccessibleDescription(/guaraníes \(PYG\)/);
    await user.type(input, "450.000");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeEnabled();
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 450000, overrideReason: "Acuerdo directo" }] }) })));
  });
  it.each(["-1", "1,5", "1.5", "9007199254740992"])("rechaza el monto inválido %s sin borrar signos ni separadores", async (value) => {
    const user = await goToRateStep(); await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    const input = wizardQueries().getByLabelText("Precio final");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
    await user.type(input, value);
    expect(input).toHaveValue(value);
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(submitBookingMock).not.toHaveBeenCalled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
  });

  it("permite corregir un monto inválido a cero y conserva el importe al crear Pendiente", async () => {
    const user = await goToRateStep(); await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    const input = wizardQueries().getByLabelText("Precio final");
    await user.type(wizardQueries().getByLabelText("Motivo del precio manual"), "Acuerdo directo");
    await user.type(input, "-1");
    expect(input).toHaveValue("-1");
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeDisabled();
    await user.clear(input); await user.type(input, "0");
    expect(wizardQueries().getByRole("button", { name: /Continuar/i })).toBeEnabled();
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 0, overrideReason: "Acuerdo directo" }] }) })));
  });

  it("conserva la revisión y muestra el rechazo sin crear una reserva incompleta", async () => {
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    createPendingBookingMock.mockRejectedValueOnce(new Error("Alojamiento no disponible"));
    const user = await goToRateStep(); await user.click(wizardQueries().getByRole("button", { name: "Manual" })); fireEvent.change(wizardQueries().getByLabelText("Precio final"), { target: { value: "350000" } }); fireEvent.change(wizardQueries().getByLabelText("Motivo del precio manual"), { target: { value: "Acuerdo" } });
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i })); await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    expect(await wizardQueries().findByRole("alert")).toHaveTextContent("Alojamiento no disponible");
    expect(screen.getByLabelText("Ruta actual")).toHaveTextContent("/app/calendar");
    expect(createPendingBookingMock).toHaveBeenCalledOnce();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    expect(createBookingMock).not.toHaveBeenCalled();
    expect(submitBookingMock).not.toHaveBeenCalled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("conserva la edición manual si aparece un plan", async () => {
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    const user = await goToRateStep(); await user.click(wizardQueries().getByRole("button", { name: "Manual" }));
    fireEvent.change(wizardQueries().getByLabelText("Precio final"), { target: { value: "350000" } });
    const reason = wizardQueries().getByLabelText("Motivo del precio manual");
    fireEvent.change(reason, { target: { value: "Acuerdo" } });
    const amount = wizardQueries().getByLabelText("Precio final");
    useSelectableRatePlansMock.mockReturnValue({ data: [{ id: "new-plan", name: "Tarifa nueva", currency: "PYG", baseNightlyAmountMinor: 500000 }], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    await user.click(reason); await user.type(reason, " directo");
    expect(wizardQueries().getByLabelText("Precio final")).toBe(amount);
    expect(reason).toHaveValue("Acuerdo directo");
    expect(reason).toHaveFocus();
    expect(screen.queryByRole("button", { name: /Tarifa nueva/i })).not.toBeInTheDocument();
    expect(wizardQueries().queryByLabelText("Plan de referencia")).not.toBeInTheDocument();
    expect(createPendingBookingMock).not.toHaveBeenCalled();
    await user.click(wizardQueries().getByRole("button", { name: /Continuar/i }));
    await user.click(wizardQueries().getByRole("button", { name: /Crear reserva/i }));
    await waitFor(() => expect(createPendingBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [{ resourceId: "resource-1", pricingMode: "MANUAL_NO_RATE_PLAN", agreedAmountMinor: 350000, overrideReason: "Acuerdo directo" }] }) })));
  });

});
