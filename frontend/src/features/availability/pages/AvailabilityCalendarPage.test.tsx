import {
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

const useResourcesMock = vi.fn();
const useBookingsMock = vi.fn();
const useBlocksMock = vi.fn();
const useContactsMock = vi.fn();
const useAvailabilityCalendarMock = vi.fn();
const useSelectableRatePlansMock = vi.fn();
const useCalculatePriceMock = vi.fn();

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
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
  createBooking: vi.fn(),
}));

vi.mock("../../bookings/api/submit-booking", () => ({
  submitBooking: vi.fn(),
}));

vi.mock("../../bookings/api/confirm-booking", () => ({
  confirmBooking: vi.fn(),
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
  beforeEach(() => {
    vi.clearAllMocks();

    useResourcesMock.mockReturnValue({
      data: [resource],
      isLoading: false,
      isError: false,
    });

    useBookingsMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    useBlocksMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
    });

    useContactsMock.mockReturnValue({
      data: [contact],
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
      screen.getByText("17-09-2026"),
    ).toBeInTheDocument();

    expect(
      screen.getByText("18-09-2026"),
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
});