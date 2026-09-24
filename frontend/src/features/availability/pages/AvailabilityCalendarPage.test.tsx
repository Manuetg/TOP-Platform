import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  MemoryRouter,
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

const context = vi.hoisted(() => ({ businessId: "business-1", role: "OWNER" }));
vi.mock("../../business/context/BusinessContext", () => ({ useBusinessContext: () => ({ activeRole: context.role, activeBusinessId: context.businessId, activeBusiness: { id: context.businessId, timezone: "America/Asuncion" } }) }));
const useResourcesMock = vi.fn();
const useBookingsMock = vi.fn();
const useBlocksMock = vi.fn();
const useContactsMock = vi.fn();
const useAvailabilityCalendarMock = vi.fn();
const useSelectableRatePlansMock = vi.fn();
const useCalculatePriceMock = vi.fn();
const createBookingMock = vi.fn();
const submitBookingMock = vi.fn();
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

  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/app/calendar"]}>
        <AvailabilityCalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

async function goToRateStep() {
  const user = await goToContactStep();
  await user.click(screen.getByRole("button", { name: /Ema Bietros/i }));
  await user.click(screen.getByRole("button", { name: /Continuar/i }));
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
    screen.getByLabelText("Entrada"),
    {
      target: {
        value: "2026-09-17",
      },
    },
  );

  await user.click(
    screen.getByRole("button", {
      name: /Buscar disponibilidad/i,
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: /Habitacion 1/i,
    }),
  );

  await user.click(
    screen.getByRole("button", {
      name: /Continuar/i,
    }),
  );

  return user;
}

describe("AvailabilityCalendarPage", () => {
  it("crea contacto con país antes del teléfono compuesto y conserva el payload normalizado", async () => {
    vi.mocked(createContact).mockResolvedValue({ ...contact, status: "ACTIVE" });
    const user = await goToContactStep();
    await user.click(screen.getByRole("button", { name: "Crear contacto" }));
    const country = screen.getByLabelText("País");
    const phone = screen.getByLabelText("Teléfono");
    expect(country.compareDocumentPosition(phone) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await user.selectOptions(country, "Argentina");
    expect(screen.getByLabelText("Prefijo internacional")).toHaveTextContent("+54");
    await user.type(screen.getByLabelText("Nombre"), "Ana");
    await user.type(screen.getByLabelText("Apellido"), "Prueba");
    await user.type(phone, "11 2345 6789");
    await user.click(screen.getByRole("button", { name: "Crear contacto" }));
    await waitFor(() => expect(createContact).toHaveBeenCalledWith(expect.objectContaining({
      businessId: "business-1", input: expect.objectContaining({ name: "Ana", lastName: "Prueba", country: "Argentina", phone: "+541123456789", whatsapp: "+541123456789" }),
    })));
  });

  beforeEach(() => {
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

  it("hides Back on step 1 and sets checkout to the next day", async () => {
    await openWizard();

    expect(
      screen.queryByRole("button", {
        name: /Atrás/i,
      }),
    ).not.toBeInTheDocument();

    const checkIn =
      screen.getByLabelText("Entrada");

    const checkOut =
      screen.getByLabelText("Salida") as HTMLInputElement;

    fireEvent.change(checkIn, {
      target: {
        value: "2026-09-17",
      },
    });

    expect(checkOut).toHaveValue(
      "2026-09-18",
    );

    expect(
      screen.getByText("17/09/2026"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("18/09/2026"),
    ).toBeInTheDocument();
  });

  it("shows the selected contact only once", async () => {
    const user = await goToContactStep();

    await user.click(
      screen.getByRole("button", {
        name: /Ema Bietros/i,
      }),
    );

    expect(
      screen.getAllByText("Ema Bietros"),
    ).toHaveLength(1);

    expect(
      screen.getByText(
        /CI · 1231231 · 0981123456/i,
      ),
    ).toBeInTheDocument();
  });

  it("automatically selects the only valid rate plan", async () => {
    const user = await goToContactStep();

    await user.click(
      screen.getByRole("button", {
        name: /Ema Bietros/i,
      }),
    );

    await user.click(
      screen.getByRole("button", {
        name: /Continuar/i,
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: /Tarifa Normal/i,
        }),
      ).toHaveClass("is-selected");
    });
  });

  it("formats a manual amount as guaranies", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    const input = screen.getByLabelText("Precio final");
    await user.type(input, "600000");
    expect(input).toHaveValue("600.000");
  });

  it("hides configured rate-plan cards in manual mode", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("button", { name: /Tarifa Normal/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Plan de referencia")).not.toBeInTheDocument();
  });

  it("shows a compact reference-plan select for multiple plans in manual mode", async () => {
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
    await user.click(screen.getByRole("button", { name: "Manual" }));
    expect(screen.queryByRole("button", { name: /Tarifa Normal/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Plan de referencia")).toBeInTheDocument();
  });

  it("keeps configured rate-plan cards visible in configured mode", async () => {
    await goToRateStep();
    expect(screen.getByRole("button", { name: /Tarifa Normal/i })).toBeInTheDocument();
  });

  it("does not calculate a preview before continuing in manual mode", async () => {
    const user = await goToRateStep();
    const calculate = useCalculatePriceMock.mock.results[0]?.value.mutateAsync as ReturnType<typeof vi.fn>;
    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Precio final"), "600000");
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(calculate).not.toHaveBeenCalled();
  });

  it("confirms manual pricing in minor units with the automatic reason", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: "Manual" }));
    await user.type(screen.getByLabelText("Precio final"), "600000");
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));
    await waitFor(() => expect(confirmBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.objectContaining({ agreedAmountMinor: 600000, overrideReason: "Precio manual desde calendario" })] }) })));
  });

  it("keeps configured pricing unchanged without a discount", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));
    await waitFor(() => expect(confirmBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.not.objectContaining({ agreedAmountMinor: expect.anything(), overrideReason: expect.anything() })] }) })));
  });

  it("usa el Business activo en todas las lecturas y en la confirmación", async () => {
    context.businessId = "business-selected";
    try {
      const user = await goToRateStep();
      for (const hook of [useResourcesMock, useBookingsMock, useBlocksMock, useContactsMock, useAvailabilityCalendarMock, useSelectableRatePlansMock, useCalculatePriceMock]) {
        expect(hook).toHaveBeenLastCalledWith(expect.objectContaining({ businessId: "business-selected" }));
      }
      await user.click(screen.getByRole("button", { name: /Continuar/i }));
      await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));
      await waitFor(() => expect(confirmBookingMock).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-selected" })));
    } finally { context.businessId = "business-1"; }
  });

  it("cerrar durante el alta aborta la señal y una respuesta tardía no continúa Submit/Confirm", async () => {
    let resolve!: (value: { id: string }) => void;
    createBookingMock.mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const user = await goToRateStep(); await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await user.dblClick(screen.getByRole("button", { name: /Confirmar reserva/i }));
    expect(createBookingMock).toHaveBeenCalledTimes(1);
    const signal: AbortSignal = createBookingMock.mock.calls[0][0].signal;
    await user.click(screen.getByRole("button", { name: "Cerrar" })); expect(signal.aborted).toBe(true);
    await act(async () => resolve({ id: "late-booking" }));
    expect(submitBookingMock).not.toHaveBeenCalled(); expect(confirmBookingMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("el asistente compartido contiene Tab y Escape devuelve foco al disparador", async () => {
    const user = await openWizard();
    expect(screen.getByRole("dialog", { name: "Nueva reserva" })).toHaveFocus();
    await user.tab({ shift: true }); expect(screen.getByRole("button", { name: /Buscar disponibilidad/ })).toHaveFocus();
    await user.tab(); expect(screen.getByRole("button", { name: "Cerrar" })).toHaveFocus();
    await user.keyboard("{Escape}"); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Nueva reserva/ })).toHaveFocus();
  });

  it("applies a 10 percent configured discount in exact minor units", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: "Aplicar descuento" }));
    await user.click(screen.getByRole("button", { name: "10%" }));
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));
    await waitFor(() => expect(confirmBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.objectContaining({ agreedAmountMinor: 5850000, overrideReason: "Descuento del 10% aplicado desde calendario" })] }) })));
  });

  it("removes the discount and restores the configured price", async () => {
    const user = await goToRateStep();
    await user.click(screen.getByRole("button", { name: "Aplicar descuento" }));
    await user.click(screen.getByRole("button", { name: "10%" }));
    await user.click(screen.getByRole("button", { name: "Quitar descuento" }));
    expect(screen.queryByText(/Descuento \(10%\)/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Continuar/i }));
    await user.click(screen.getByRole("button", { name: /Confirmar reserva/i }));
    await waitFor(() => expect(confirmBookingMock).toHaveBeenCalledWith(expect.objectContaining({ input: expect.objectContaining({ pricing: [expect.not.objectContaining({ agreedAmountMinor: expect.anything(), overrideReason: expect.anything() })] }) })));
  });
  it.each(["OWNER", "ADMIN", "RECEPTIONIST", "VIEWER"])("no ofrece modos ni permite continuar sin planes para %s", async (role) => {
    context.role = role;
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    await goToRateStep();
    expect(screen.getByText("No hay un tarifario disponible para esta estadía.")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Configurada" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeDisabled();
    expect(confirmBookingMock).not.toHaveBeenCalled();
  });
  it.each(["RECEPTIONIST", "VIEWER"])("no ofrece override ni descuento a %s", async (role) => {
    context.role = role; await goToRateStep();
    expect(screen.queryByRole("button", { name: "Manual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aplicar descuento" })).not.toBeInTheDocument();
  });
  it("no presenta vacío durante carga ni después de error y permite reintentar", async () => {
    const retry = vi.fn(); useSelectableRatePlansMock.mockReturnValue({ data: undefined, isSuccess: false, isLoading: true, isFetching: true, isError: false, refetch: retry });
    const user = await goToRateStep(); expect(screen.getByText("Buscando planes tarifarios…")).toBeVisible();
    expect(screen.queryByText("No hay un tarifario disponible para esta estadía.")).not.toBeInTheDocument();
    useSelectableRatePlansMock.mockReturnValue({ data: undefined, isSuccess: false, isLoading: false, isFetching: false, isError: true, refetch: retry });
    await user.click(screen.getByRole("button", { name: /Atrás/i })); await user.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(screen.getByText("No pudimos consultar los tarifarios de esta estadía.")).toBeVisible();
    expect(screen.getByRole("button", { name: /Continuar/i })).toBeDisabled(); await user.click(screen.getByRole("button", { name: "Reintentar tarifarios" })); expect(retry).toHaveBeenCalledOnce();
  });
  it("el cambio de fechas descarta una tarifa previamente seleccionada", async () => {
    const user = await goToRateStep(); expect(screen.getByRole("button", { name: /Tarifa Normal/i })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: /Atrás/i })); await user.click(screen.getByRole("button", { name: /Atrás/i })); await user.click(screen.getByRole("button", { name: /Atrás/i }));
    useSelectableRatePlansMock.mockReturnValue({ data: [], isSuccess: true, isLoading: false, isFetching: false, isError: false, refetch: vi.fn() });
    fireEvent.change(screen.getByLabelText("Entrada"), { target: { value: "2026-09-18" } }); fireEvent.change(screen.getByLabelText("Salida"), { target: { value: "2026-09-20" } });
    await user.click(screen.getByRole("button", { name: /Buscar disponibilidad/i })); await user.click(screen.getByRole("button", { name: /Habitacion 1/i })); await user.click(screen.getByRole("button", { name: /Continuar/i })); await user.click(screen.getByRole("button", { name: /Continuar/i }));
    expect(screen.getByText("No hay un tarifario disponible para esta estadía.")).toBeVisible(); expect(screen.getByRole("button", { name: /Continuar/i })).toBeDisabled();
  });

});
