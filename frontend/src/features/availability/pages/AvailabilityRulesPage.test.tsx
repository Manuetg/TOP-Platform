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
import { AvailabilityRulesPage } from "./AvailabilityRulesPage";

const useAvailabilityRulesMock = vi.fn();
const useUpdateAvailabilityRulesMock = vi.fn();
const mutateAsyncMock = vi.fn();

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
    },
  }),
}));

vi.mock("../queries/use-availability-rules", () => ({
  useAvailabilityRules: (
    ...args: unknown[]
  ) =>
    useAvailabilityRulesMock(...args),

  useUpdateAvailabilityRules: (
    ...args: unknown[]
  ) =>
    useUpdateAvailabilityRulesMock(...args),
}));

function renderPage() {
  return render(
    <MemoryRouter
      initialEntries={[
        "/app/availability/rules",
      ]}
    >
      <AvailabilityRulesPage />
    </MemoryRouter>,
  );
}

describe("AvailabilityRulesPage", () => {
  beforeEach(() => {
    mutateAsyncMock.mockReset();

    mutateAsyncMock.mockResolvedValue({
      businessId: "business-1",
      pendingBlocksAvailability: true,
      bufferBeforeDays: 1,
      bufferAfterDays: 2,
    });

    useAvailabilityRulesMock.mockReturnValue({
      data: {
        businessId: "business-1",
        pendingBlocksAvailability: true,
        bufferBeforeDays: 1,
        bufferAfterDays: 2,
      },
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    useUpdateAvailabilityRulesMock.mockReturnValue({
      mutateAsync: mutateAsyncMock,
      isPending: false,
      isError: false,
      error: null,
    });
  });

  it("renders current backend rules", () => {
    renderPage();

    expect(
      screen.getByRole("heading", {
        name: /Reglas de disponibilidad/i,
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("checkbox"),
    ).toBeChecked();

    expect(
      screen.getByLabelText(/Buffer antes/i),
    ).toHaveValue(1);

    expect(
      screen.getByLabelText(/Buffer después/i),
    ).toHaveValue(2);
  });

  it("submits updated rules", async () => {
    const user = userEvent.setup();

    renderPage();

    await user.click(
      screen.getByRole("checkbox"),
    );

    fireEvent.change(
      screen.getByLabelText(/Buffer antes/i),
      {
        target: {
          value: "3",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Buffer después/i),
      {
        target: {
          value: "4",
        },
      },
    );

    await user.click(
      screen.getByRole("button", {
        name: /Guardar cambios/i,
      }),
    );

    expect(
      mutateAsyncMock,
    ).toHaveBeenCalledWith({
      pendingBlocksAvailability: false,
      bufferBeforeDays: 3,
      bufferAfterDays: 4,
    });

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Reglas guardadas correctamente.",
    );
  });

  it("rejects invalid buffer values", async () => {
    const user = userEvent.setup();

    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Buffer antes/i),
      {
        target: {
          value: "-1",
        },
      },
    );

    await user.click(
      screen.getByRole("button", {
        name: /Guardar cambios/i,
      }),
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      /iguales o mayores a 0/i,
    );

    expect(
      mutateAsyncMock,
    ).not.toHaveBeenCalled();
  });

  it("shows loading state", () => {
    useAvailabilityRulesMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    });

    renderPage();

    expect(
      screen.getByRole("status"),
    ).toHaveTextContent(
      "Cargando reglas",
    );
  });

  it("shows load error", () => {
    useAvailabilityRulesMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error(
        "No se pudieron cargar las reglas.",
      ),
      refetch: vi.fn(),
    });

    renderPage();

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "No se pudieron cargar las reglas.",
    );
  });

  it("shows update error", async () => {
    const user = userEvent.setup();

    useUpdateAvailabilityRulesMock.mockReturnValue({
      mutateAsync: vi
        .fn()
        .mockRejectedValue(
          new Error(
            "No se pudieron guardar las reglas.",
          ),
        ),
      isPending: false,
      isError: true,
      error: new Error(
        "No se pudieron guardar las reglas.",
      ),
    });

    renderPage();

    await user.click(
      screen.getByRole("button", {
        name: /Guardar cambios/i,
      }),
    );

    expect(
      screen.getByRole("alert"),
    ).toHaveTextContent(
      "No se pudieron guardar las reglas.",
    );
  });
});