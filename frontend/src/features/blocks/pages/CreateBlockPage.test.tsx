import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { CreateBlockPage } from "./CreateBlockPage";

const useResourcesMock = vi.fn();
const mutateAsyncMock = vi.fn();
const navigateMock = vi.fn();

vi.mock("../../resources/queries/use-resources", () => ({
  useResources: (...args: unknown[]) =>
    useResourcesMock(...args),
}));

vi.mock("../queries/use-create-block", () => ({
  useCreateBlock: () => ({
    mutateAsync: mutateAsyncMock,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
    },
  }),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<
    typeof import("react-router-dom")
  >("react-router-dom");

  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <CreateBlockPage businessId="business-1" />
    </MemoryRouter>,
  );
}

describe("CreateBlockPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    useResourcesMock.mockReturnValue({
      data: [
        {
          id: "resource-1",
          name: "Suite 1",
          status: "ACTIVE",
        },
        {
          id: "resource-2",
          name: "Suite 2",
          status: "OUT_OF_SERVICE",
        },
        {
          id: "resource-3",
          name: "Suite archivada",
          status: "ARCHIVED",
        },
      ],
      isLoading: false,
      isError: false,
    });

    mutateAsyncMock.mockResolvedValue({
      id: "block-1",
    });
  });

  it("does not show archived resources", () => {
    renderPage();

    expect(
      screen.getByText("Suite 1"),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        "Suite 2 — Fuera de servicio",
      ),
    ).toBeInTheDocument();

    expect(
      screen.queryByText("Suite archivada"),
    ).not.toBeInTheDocument();
  });

  it("validates required resource", async () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Motivo/),
      {
        target: {
          value: "Mantenimiento",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Inicio/),
      {
        target: {
          value: "2026-09-20T09:00",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Fin/),
      {
        target: {
          value: "2026-09-20T10:00",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Crear bloqueo",
      }),
    );

    expect(
      screen.getByText(
        "Seleccioná un recurso.",
      ),
    ).toBeInTheDocument();

    expect(
      mutateAsyncMock,
    ).not.toHaveBeenCalled();
  });

  it("validates that end is after start", () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Recurso/),
      {
        target: {
          value: "resource-1",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Motivo/),
      {
        target: {
          value: "Mantenimiento",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Inicio/),
      {
        target: {
          value: "2026-09-20T10:00",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Fin/),
      {
        target: {
          value: "2026-09-20T09:00",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Crear bloqueo",
      }),
    );

    expect(
      screen.getByText(
        "El fin debe ser posterior al inicio.",
      ),
    ).toBeInTheDocument();

    expect(
      mutateAsyncMock,
    ).not.toHaveBeenCalled();
  });

  it("creates a valid block and returns to the list", async () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText(/Recurso/),
      {
        target: {
          value: "resource-1",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Tipo/),
      {
        target: {
          value: "OWNER_USE",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Motivo/),
      {
        target: {
          value: "Uso familiar",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Inicio/),
      {
        target: {
          value: "2026-09-20T09:00",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/Fin/),
      {
        target: {
          value: "2026-09-20T11:00",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText("Observaciones"),
      {
        target: {
          value: "Visita del propietario",
        },
      },
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Crear bloqueo",
      }),
    );

    await waitFor(() => {
      expect(
        mutateAsyncMock,
      ).toHaveBeenCalledTimes(1);
    });

    const payload =
      mutateAsyncMock.mock.calls[0][0];

    expect(payload.resourceId).toBe(
      "resource-1",
    );
    expect(payload.type).toBe("OWNER_USE");
    expect(payload.reason).toBe(
      "Uso familiar",
    );
    expect(payload.notes).toBe(
      "Visita del propietario",
    );

    expect(payload.startsAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    expect(payload.endsAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );

    expect(navigateMock).toHaveBeenCalledWith(
      "/app/blocks",
    );
  });
});