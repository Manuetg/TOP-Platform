import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AvailabilityCheckPage } from "./AvailabilityCheckPage";

const useResourcesMock = vi.fn();
const useAvailabilityCheckMock = vi.fn();

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
    },
  }),
}));

vi.mock("../../resources/queries/use-resources", () => ({
  useResources: (
    ...args: unknown[]
  ) => useResourcesMock(...args),
}));

vi.mock("../queries/use-availability-check", () => ({
  useAvailabilityCheck: (
    ...args: unknown[]
  ) =>
    useAvailabilityCheckMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/availability"]}>
      <AvailabilityCheckPage />
    </MemoryRouter>,
  );
}

describe("AvailabilityCheckPage", () => {
  beforeEach(() => {
    useResourcesMock.mockReturnValue({
      data: [
        {
          id: "resource-1",
          name: "Habitación 1",
          status: "ACTIVE",
        },
      ],
      isLoading: false,
      isError: false,
    });

    useAvailabilityCheckMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });
  });

  it("renders the availability form", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: /Consultar disponibilidad/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Recurso/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Entrada/i),
    ).toBeInTheDocument();

    expect(
      screen.getByLabelText(/Salida/i),
    ).toBeInTheDocument();
  });

  it("requires a resource before submitting", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: /Consultar disponibilidad/i,
      }),
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "Seleccioná un recurso.",
    );
  });

  it("enables the backend query after a valid submit", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.selectOptions(
      screen.getByLabelText(/Recurso/i),
      "resource-1",
    );

    await user.click(
      screen.getByRole("button", {
        name: /Consultar disponibilidad/i,
      }),
    );

    const lastCall =
      useAvailabilityCheckMock.mock.calls.at(-1)?.[0];

    expect(lastCall).toEqual(
      expect.objectContaining({
        resourceId: "resource-1",
        enabled: true,
      }),
    );
  });

  it("shows an available result returned by backend", () => {
    useAvailabilityCheckMock.mockReturnValue({
      data: {
        resourceId: "resource-1",
        from: "2026-09-10",
        to: "2026-09-12",
        status: "AVAILABLE",
        reasons: [],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Recurso/i),
      {
        target: {
          value: "resource-1",
        },
      },
    );

    fireEvent.submit(
      screen
        .getByRole("button", {
          name: /Consultar disponibilidad/i,
        })
        .closest("form")!,
    );

    expect(
      screen.getByText("Disponible"),
    ).toBeInTheDocument();
  });

  it("shows conflict reasons returned by backend", () => {
    useAvailabilityCheckMock.mockReturnValue({
      data: {
        resourceId: "resource-1",
        from: "2026-09-10",
        to: "2026-09-12",
        status: "UNAVAILABLE",
        reasons: [
          "BOOKING_CONFLICT",
          "BLOCK_CONFLICT",
        ],
      },
      isLoading: false,
      isFetching: false,
      isError: false,
      error: null,
    });

    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Recurso/i),
      {
        target: {
          value: "resource-1",
        },
      },
    );

    fireEvent.submit(
      screen
        .getByRole("button", {
          name: /Consultar disponibilidad/i,
        })
        .closest("form")!,
    );

    expect(
      screen.getByText("No disponible"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Existe una reserva que bloquea este rango/i,
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        /Existe un bloqueo operativo en este rango/i,
      ),
    ).toBeInTheDocument();
  });

  it("shows backend query errors", () => {
    useAvailabilityCheckMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isFetching: false,
      isError: true,
      error: new Error(
        "No se pudo consultar disponibilidad.",
      ),
    });

    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Recurso/i),
      {
        target: {
          value: "resource-1",
        },
      },
    );

    fireEvent.submit(
      screen
        .getByRole("button", {
          name: /Consultar disponibilidad/i,
        })
        .closest("form")!,
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "No se pudo consultar disponibilidad.",
    );
  });
});