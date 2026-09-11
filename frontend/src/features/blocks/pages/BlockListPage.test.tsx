import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { BlockListPage } from "./BlockListPage";

const useBlocksMock = vi.fn();
const useResourcesMock = vi.fn();
const cancelMutateAsyncMock = vi.fn();
const cancelResetMock = vi.fn();

vi.mock("../queries/use-blocks", () => ({
  useBlocks: (...args: unknown[]) =>
    useBlocksMock(...args),
}));

vi.mock("../queries/use-cancel-block", () => ({
  useCancelBlock: () => ({
    mutateAsync: cancelMutateAsyncMock,
    reset: cancelResetMock,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

vi.mock("../../resources/queries/use-resources", () => ({
  useResources: (...args: unknown[]) =>
    useResourcesMock(...args),
}));

vi.mock("../../auth/context/AuthContext", () => ({
  useAuth: () => ({
    session: {
      accessToken: "token-123",
    },
  }),
}));

const blocks = [
  {
    id: "block-1",
    businessId: "business-1",
    resourceId: "resource-1",
    type: "MAINTENANCE",
    reason: "Pintura general",
    notes: "Cerrar habitación",
    startsAt: "2026-09-10T12:00:00.000Z",
    endsAt: "2026-09-12T12:00:00.000Z",
    status: "SCHEDULED",
    effectiveStatus: "SCHEDULED",
    cancellationReason: null,
    cancelledAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  },
  {
    id: "block-2",
    businessId: "business-1",
    resourceId: "resource-2",
    type: "OWNER_USE",
    reason: "Uso familiar",
    notes: null,
    startsAt: "2026-09-05T12:00:00.000Z",
    endsAt: "2026-09-06T12:00:00.000Z",
    status: "SCHEDULED",
    effectiveStatus: "FINISHED",
    cancellationReason: null,
    cancelledAt: null,
    createdAt: "2026-09-01T12:00:00.000Z",
    updatedAt: "2026-09-01T12:00:00.000Z",
  },
];

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/app/blocks"]}>
      <BlockListPage businessId="business-1" />
    </MemoryRouter>,
  );
}

describe("BlockListPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    cancelMutateAsyncMock.mockResolvedValue({
      id: "block-1",
      status: "CANCELLED",
      effectiveStatus: "CANCELLED",
    });

    useResourcesMock.mockReturnValue({
      data: [
        {
          id: "resource-1",
          name: "Suite 1",
        },
        {
          id: "resource-2",
          name: "Suite 2",
        },
      ],
      isLoading: false,
    });

    useBlocksMock.mockReturnValue({
      data: blocks,
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });
  });

  it("renders blocks using resource names and effective statuses", () => {
    renderPage();

    expect(
      screen.getAllByText("Suite 1").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("Pintura general").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("Programado").length,
    ).toBeGreaterThan(0);

    expect(
      screen.getAllByText("Finalizado").length,
    ).toBeGreaterThan(0);
  });

  it("filters by effective status in the frontend", () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText("Estado"),
      {
        target: {
          value: "FINISHED",
        },
      },
    );

    expect(
      screen.queryByText("Pintura general"),
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByText("Uso familiar").length,
    ).toBeGreaterThan(0);
  });

  it("filters by type in the frontend", () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText("Tipo"),
      {
        target: {
          value: "OWNER_USE",
        },
      },
    );

    expect(
      screen.queryByText("Pintura general"),
    ).not.toBeInTheDocument();

    expect(
      screen.getAllByText("Uso familiar").length,
    ).toBeGreaterThan(0);
  });

  it("does not execute the blocks query with an invalid date range", () => {
    renderPage();

    fireEvent.change(
      screen.getByLabelText("Desde"),
      {
        target: {
          value: "2026-09-20",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText("Hasta"),
      {
        target: {
          value: "2026-09-15",
        },
      },
    );

    expect(
      screen.getByText(
        "La fecha “Hasta” debe ser posterior a la fecha “Desde”.",
      ),
    ).toBeInTheDocument();

    const lastCall =
      useBlocksMock.mock.calls[
        useBlocksMock.mock.calls.length - 1
      ][0];

    expect(lastCall.enabled).toBe(false);
    expect(lastCall.from).toBeUndefined();
    expect(lastCall.to).toBeUndefined();
  });

  it("shows cancel action only for cancellable blocks", () => {
    renderPage();

    const cancelButtons =
      screen.getAllByRole("button", {
        name: /Cancelar bloqueo/,
      });

    expect(cancelButtons.length).toBeGreaterThan(0);

    expect(
      screen.queryByRole("button", {
        name: /Cancelar bloqueo de Suite 2/,
      }),
    ).not.toBeInTheDocument();
  });

  it("validates cancel reason before calling the mutation", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancelar bloqueo de Suite 1",
      }),
    );

    expect(
      screen.getByRole("dialog"),
    ).toBeInTheDocument();

    const dialog = screen.getByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Cancelar bloqueo",
      }),
    );

    expect(
      within(dialog).getByText(
        "El motivo de cancelación debe tener entre 2 y 500 caracteres.",
      ),
    ).toBeInTheDocument();

    expect(
      cancelMutateAsyncMock,
    ).not.toHaveBeenCalled();
  });

  it("cancels a scheduled block from the list", async () => {
    renderPage();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Cancelar bloqueo de Suite 1",
      }),
    );

    fireEvent.change(
      screen.getByLabelText(
        "Motivo de cancelación",
      ),
      {
        target: {
          value: "Mantenimiento reprogramado",
        },
      },
    );

    const dialog = screen.getByRole("dialog");

    fireEvent.click(
      within(dialog).getByRole("button", {
        name: "Cancelar bloqueo",
      }),
    );

    await waitFor(() => {
      expect(
        cancelMutateAsyncMock,
      ).toHaveBeenCalledWith({
        blockId: "block-1",
        reason: "Mantenimiento reprogramado",
      });
    });
  });
  it("shows loading state", () => {
    useBlocksMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();

    expect(
      screen.getByText("Cargando bloqueos"),
    ).toBeInTheDocument();
  });

  it("shows backend error state", () => {
    useBlocksMock.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: new Error("Error backend"),
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();

    expect(
      screen.getByText(
        "No pudimos cargar los bloqueos",
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText("Error backend"),
    ).toBeInTheDocument();
  });

  it("shows empty state", () => {
    useBlocksMock.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    });

    renderPage();

    expect(
      screen.getByText(
        "Todavía no hay bloqueos",
      ),
    ).toBeInTheDocument();
  });
});