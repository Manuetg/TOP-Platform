import { render, screen, within } from "@testing-library/react";
import type { InfiniteData } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/api-client";
import { useOutstandingBalance } from "../queries/use-outstanding-balance";
import { usePaymentHistory } from "../queries/use-payment-history";
import type { OutstandingBalance, PaymentHistoryItem, PaymentHistoryPage } from "../types/payment.types";
import { BookingPayments } from "./BookingPayments";

vi.mock("../queries/use-outstanding-balance", () => ({ useOutstandingBalance: vi.fn() }));
vi.mock("../queries/use-payment-history", () => ({ usePaymentHistory: vi.fn() }));
const balance = vi.mocked(useOutstandingBalance);
const history = vi.mocked(usePaymentHistory);
const refetchBalance = vi.fn();
const refetchHistory = vi.fn();
const fetchNextPage = vi.fn();
const payment: PaymentHistoryItem = { id: "payment-1", bookingId: "booking", amountMinor: 300000, currency: "PYG", method: "CASH", reference: "REC-1", note: null, paidAt: "2026-09-02T12:00:00.000Z", createdAt: "2026-09-02T12:01:00.000Z", recordedByUserId: "user", status: "RECORDED" };
const outstanding: OutstandingBalance = { bookingId: "booking", currency: "PYG", totalAmountMinor: 1000000, paidAmountMinor: 300000, outstandingAmountMinor: 700000, overdueAmountMinor: 0, financialStatus: "PARTIALLY_PAID", nextDueDate: null, nextDueAmountMinor: null };
const firstPage: PaymentHistoryPage = { items: [payment], pageInfo: { hasNextPage: true, nextCursor: "opaque" } };
const props = { userId: "user", businessId: "business", bookingId: "booking", accessToken: "token", timezone: "America/Asuncion", enabled: true };
type BalanceResult = ReturnType<typeof useOutstandingBalance>;
type HistoryResult = ReturnType<typeof usePaymentHistory>;
interface BalanceOverrides { data?: OutstandingBalance; isLoading?: boolean; isFetching?: boolean; isError?: boolean; error?: Error; }
interface HistoryOverrides { data?: InfiniteData<PaymentHistoryPage>; isLoading?: boolean; isError?: boolean; isFetchingNextPage?: boolean; isFetchNextPageError?: boolean; hasNextPage?: boolean; error?: Error; }

function show() { return render(<BookingPayments {...props} />); }
function setBalance(overrides: BalanceOverrides = {}) {
  const result = { data: outstanding, isLoading: false, isFetching: false, isError: false, refetch: refetchBalance, ...overrides } satisfies BalanceOverrides & { refetch: typeof refetchBalance };
  balance.mockReturnValue(result as unknown as BalanceResult);
}
function setHistory(overrides: HistoryOverrides = {}) {
  const result = { data: { pages: [firstPage], pageParams: [null] }, isLoading: false, isError: false, hasNextPage: true, isFetchingNextPage: false, isFetchNextPageError: false, fetchNextPage, refetch: refetchHistory, ...overrides } satisfies HistoryOverrides & { fetchNextPage: typeof fetchNextPage; refetch: typeof refetchHistory };
  history.mockReturnValue(result as unknown as HistoryResult);
}
function success(balanceOverrides: BalanceOverrides = {}, historyOverrides: HistoryOverrides = {}) { setBalance(balanceOverrides); setHistory(historyOverrides); }

beforeEach(() => { vi.clearAllMocks(); success(); });
describe("BookingPayments", () => {
  it("shows backend balance values, real zero and a paged payment without deriving totals", async () => {
    show();
    const balanceSection = screen.getByRole("region", { name: "Resumen financiero" });
    const historySection = screen.getByRole("region", { name: "Historial de pagos" });
    expect(within(balanceSection).getByText("₲ 1.000.000")).toBeVisible();
    expect(within(balanceSection).getByText("₲ 0")).toBeVisible();
    expect(within(balanceSection).getByText("Pago parcial").parentElement).toHaveTextContent("Sin próximo vencimiento");
    expect(within(historySection).getByText("Referencia: REC-1")).toBeVisible();
    await userEvent.click(within(historySection).getByRole("button", { name: "Cargar más" }));
    expect(fetchNextPage).toHaveBeenCalledOnce();
  });

  it("keeps the usable history when the balance has no PricingSnapshot", () => {
    success({ data: undefined, isError: true, error: new ApiError(409, "snapshot") });
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Saldo no disponible");
    expect(within(screen.getByRole("region", { name: "Historial de pagos" })).getByText("Referencia: REC-1")).toBeVisible();
  });

  it("moves focus to the balance status before the focused retry disappears", async () => {
    setBalance({ data: undefined, isError: true, error: new Error("network") });
    const user = userEvent.setup();
    show();
    await user.click(screen.getByRole("button", { name: "Reintentar saldo" }));
    expect(screen.getByLabelText("Estado del saldo")).toHaveFocus();
    expect(refetchBalance).toHaveBeenCalledOnce();
  });

  it("moves focus to the history status when the focused load-more button disappears", () => {
    const view = show();
    screen.getByRole("button", { name: "Cargar más" }).focus();
    setHistory({ data: { pages: [{ ...firstPage, pageInfo: { hasNextPage: false, nextCursor: null } }], pageParams: [null] }, hasNextPage: false });
    view.rerender(<BookingPayments {...props} />);
    expect(screen.getByText("No hay más pagos para mostrar.")).toHaveFocus();
  });

  it("does not duplicate repeated item ids from backend pages", () => {
    const secondPage: PaymentHistoryPage = { items: [payment], pageInfo: { hasNextPage: false, nextCursor: null } };
    success({}, { data: { pages: [firstPage, secondPage], pageParams: [null, "opaque"] }, hasNextPage: false });
    show();
    expect(within(screen.getByRole("region", { name: "Historial de pagos" })).getAllByRole("listitem")).toHaveLength(1);
  });
});
