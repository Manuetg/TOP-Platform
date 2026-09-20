import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../../../shared/api/api-client";
import { getOutstandingBalance } from "../api/get-outstanding-balance";
import { listPayments } from "../api/list-payments";
import type { OutstandingBalance, PaymentHistoryPage } from "../types/payment.types";
import { BookingPayments } from "./BookingPayments";

vi.mock("../api/get-outstanding-balance", () => ({ getOutstandingBalance: vi.fn() }));
vi.mock("../api/list-payments", () => ({ listPayments: vi.fn() }));
const balance: OutstandingBalance = { bookingId: "booking", currency: "PYG", totalAmountMinor: 1000, paidAmountMinor: 0, outstandingAmountMinor: 1000, overdueAmountMinor: 0, financialStatus: "UNPAID", nextDueDate: null, nextDueAmountMinor: null };
const page = (id: string, hasNextPage: boolean, nextCursor: string | null): PaymentHistoryPage => ({ items: [{ id, bookingId: "booking", amountMinor: 1000, currency: "PYG", method: "CASH", reference: id, note: null, paidAt: "2026-09-02T12:00:00.000Z", createdAt: "2026-09-02T12:00:00.000Z", recordedByUserId: "user", status: "RECORDED" }], pageInfo: { hasNextPage, nextCursor } });
function show() { const client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); return { client, ...render(<QueryClientProvider client={client}><BookingPayments userId="user" businessId="business" bookingId="booking" accessToken="token" timezone="America/Asuncion" enabled /></QueryClientProvider>) }; }

beforeEach(() => { vi.mocked(getOutstandingBalance).mockReset(); vi.mocked(listPayments).mockReset(); vi.mocked(getOutstandingBalance).mockResolvedValue(balance); });
describe("BookingPayments pagination integration", () => {
  it("keeps the first page visible and retries its cursor after a transport failure", async () => {
    vi.mocked(listPayments).mockResolvedValueOnce(page("payment-1", true, "opaque")).mockRejectedValueOnce(new Error("transport")).mockResolvedValueOnce(page("payment-2", false, null));
    const user = userEvent.setup();
    show();
    const region = screen.getByRole("region", { name: "Historial de pagos" });
    await waitFor(() => expect(within(region).getByText("Referencia: payment-1")).toBeVisible());
    await user.click(within(region).getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(within(region).getByRole("alert")).toHaveTextContent("No pudimos cargar más pagos."));
    expect(within(region).getByText("Referencia: payment-1")).toBeVisible();
    await user.click(within(region).getByRole("button", { name: "Reintentar cargar más" }));
    await waitFor(() => expect(within(region).getByText("Referencia: payment-2")).toBeVisible());
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(listPayments).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: "opaque" }));
    expect(listPayments).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: "opaque" }));
  });

  it("removes pages and pagination after a forbidden next page", async () => {
    vi.mocked(listPayments).mockResolvedValueOnce(page("payment-1", true, "opaque")).mockRejectedValueOnce(new ApiError(403, "forbidden"));
    const user = userEvent.setup();
    show();
    const region = screen.getByRole("region", { name: "Historial de pagos" });
    await waitFor(() => expect(within(region).getByRole("button", { name: "Cargar más" })).toBeVisible());
    await user.click(within(region).getByRole("button", { name: "Cargar más" }));
    await waitFor(() => expect(within(region).getByRole("alert")).toHaveTextContent("No tienes permiso"));
    expect(within(region).queryByRole("list")).not.toBeInTheDocument();
    expect(within(region).queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
  });

  it("keeps a complete history after refetch failure and retries the update without requesting another page", async () => {
    let resolveUpdate: (value: PaymentHistoryPage) => void;
    const pendingUpdate = new Promise<PaymentHistoryPage>((resolve) => { resolveUpdate = resolve; });
    vi.mocked(listPayments).mockResolvedValueOnce(page("payment-1", false, null)).mockRejectedValueOnce(new Error("transport")).mockReturnValueOnce(pendingUpdate);
    const user = userEvent.setup();
    const { client } = show();
    const region = screen.getByRole("region", { name: "Historial de pagos" });
    await waitFor(() => expect(within(region).getByText("Referencia: payment-1")).toBeVisible());
    await client.refetchQueries({ queryKey: ["payment-history"] });
    await waitFor(() => expect(within(region).getByRole("alert")).toHaveTextContent("No pudimos actualizar el historial de pagos."));
    expect(within(region).getByText("Referencia: payment-1")).toBeVisible();
    expect(within(region).queryByRole("button", { name: /cargar más/i })).not.toBeInTheDocument();
    const retry = within(region).getByRole("button", { name: "Reintentar actualización" });
    retry.focus();
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Estado de paginación")).toHaveFocus();
    await waitFor(() => expect(listPayments).toHaveBeenCalledTimes(3));
    expect(listPayments).toHaveBeenNthCalledWith(2, expect.objectContaining({ cursor: null }));
    expect(listPayments).toHaveBeenNthCalledWith(3, expect.objectContaining({ cursor: null }));
    resolveUpdate!(page("payment-1", false, null));
    await waitFor(() => expect(within(region).queryByRole("alert")).not.toBeInTheDocument());
    expect(within(region).getByText("Referencia: payment-1")).toBeVisible();
  });
});
