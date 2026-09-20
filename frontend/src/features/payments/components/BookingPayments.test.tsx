import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/api-client";
import { useOutstandingBalance } from "../queries/use-outstanding-balance";
import { usePaymentHistory } from "../queries/use-payment-history";
import { BookingPayments } from "./BookingPayments";

vi.mock("../queries/use-outstanding-balance", () => ({ useOutstandingBalance: vi.fn() }));
vi.mock("../queries/use-payment-history", () => ({ usePaymentHistory: vi.fn() }));
const balance = vi.mocked(useOutstandingBalance);
const history = vi.mocked(usePaymentHistory);
const refetchBalance = vi.fn();
const refetchHistory = vi.fn();
const fetchNextPage = vi.fn();
const payment = { id: "payment-1", bookingId: "booking", amountMinor: 300000, currency: "PYG", method: "CASH", reference: "REC-1", note: null, paidAt: "2026-09-02T12:00:00.000Z", createdAt: "2026-09-02T12:01:00.000Z", recordedByUserId: "user", status: "RECORDED" as const };
const outstanding = { bookingId: "booking", currency: "PYG", totalAmountMinor: 1000000, paidAmountMinor: 300000, outstandingAmountMinor: 700000, overdueAmountMinor: 0, financialStatus: "PARTIALLY_PAID" as const, nextDueDate: null, nextDueAmountMinor: null };
const props = { userId: "user", businessId: "business", bookingId: "booking", accessToken: "token", timezone: "America/Asuncion", enabled: true };
function show() { return render(<BookingPayments {...props} />); }
function success(balanceOverrides: Record<string, unknown> = {}, historyOverrides: Record<string, unknown> = {}) { balance.mockReturnValue({ data: outstanding, isLoading: false, isError: false, refetch: refetchBalance, ...balanceOverrides } as never); history.mockReturnValue({ data: { pages: [{ items: [payment], pageInfo: { hasNextPage: true, nextCursor: "opaque" } }] }, isLoading: false, isError: false, hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage, refetch: refetchHistory, ...historyOverrides } as never); }

beforeEach(() => { vi.clearAllMocks(); success(); });
describe("BookingPayments", () => {
  it("shows backend balance values, real zero and a paged payment without deriving totals", async () => {
    show();
    expect(screen.getByText("₲ 1.000.000")).toBeVisible();
    expect(screen.getByText("₲ 0")).toBeVisible();
    expect(screen.getByText("Pago parcial")).toBeVisible();
    expect(screen.getByText("Sin próximo vencimiento")).toBeVisible();
    expect(screen.getByText("Referencia: REC-1")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Cargar más" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("keeps the usable history when the balance has no PricingSnapshot", () => {
    success({ isError: true, error: new ApiError(409, "snapshot") });
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Saldo no disponible");
    expect(screen.getByText("Referencia: REC-1")).toBeVisible();
    expect(screen.queryByText("₲ 1.000.000")).not.toBeInTheDocument();
  });

  it("shows safe errors and retries each failed source independently", async () => {
    balance.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new ApiError(403, "private"), refetch: refetchBalance } as never);
    history.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("network"), refetch: refetchHistory } as never);
    show();
    expect(screen.getByText("No tienes permiso para ver esta información.")).toBeVisible();
    expect(screen.getByText("No pudimos cargar el historial de pagos.")).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Reintentar saldo" }));
    await userEvent.click(screen.getByRole("button", { name: "Reintentar historial" }));
    expect(refetchBalance).toHaveBeenCalledOnce();
    expect(refetchHistory).toHaveBeenCalledOnce();
  });

  it("keeps loaded pages after a next-page error and retries the same action", async () => {
    success({}, { isFetchNextPageError: true, error: new Error("transport") });
    show();
    expect(screen.getAllByText("₲ 300.000")).toHaveLength(2);
    expect(screen.getByRole("alert")).toHaveTextContent("No pudimos cargar más pagos.");
    await userEvent.click(screen.getByRole("button", { name: "Reintentar cargar más" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("moves focus to the history status when the focused load-more button disappears", () => {
    const view = show();
    const more = screen.getByRole("button", { name: "Cargar más" });
    more.focus();
    history.mockReturnValue({ data: { pages: [{ items: [payment], pageInfo: { hasNextPage: false, nextCursor: null } }] }, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage, refetch: refetchHistory } as never);
    view.rerender(<BookingPayments {...props} />);
    expect(screen.getByText("No hay más pagos para mostrar.")).toHaveFocus();
  });

  it("moves focus from a disappeared history retry button without a late recovery", () => {
    history.mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("network"), refetch: refetchHistory } as never);
    const view = show();
    screen.getByRole("button", { name: "Reintentar historial" }).focus();
    history.mockReturnValue({ data: { pages: [{ items: [], pageInfo: { hasNextPage: false, nextCursor: null } }] }, isLoading: false, isError: false, hasNextPage: false, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage, refetch: refetchHistory } as never);
    view.rerender(<BookingPayments {...props} />);
    expect(screen.getByLabelText("Estado de paginación")).toHaveFocus();
  });

  it("does not duplicate repeated item ids from backend pages", () => {
    success({}, { data: { pages: [{ items: [payment], pageInfo: { hasNextPage: true, nextCursor: "one" } }, { items: [payment], pageInfo: { hasNextPage: false, nextCursor: null } }] } });
    show();
    expect(screen.getAllByText("₲ 300.000")).toHaveLength(1);
  });
});
