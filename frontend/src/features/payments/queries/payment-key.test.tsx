import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerPayment } from "../api/payment-api";
import { useRegisterPayment } from "./use-booking-finances";

vi.mock("../api/payment-api", () => ({ registerPayment: vi.fn() }));

const options = { businessId: "business-a", bookingId: "booking-a", accessToken: "synthetic-token" };
const input = { amountMinor: 1, method: "CASH" as const, paidAt: "2026-10-02T12:00:00.000Z" };
const clients: QueryClient[] = [];

function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  clients.push(client);
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return renderHook(() => useRegisterPayment(options), { wrapper });
}

beforeEach(() => { vi.mocked(registerPayment).mockReset(); });
afterEach(() => {
  clients.splice(0).forEach((client) => client.clear());
  vi.unstubAllGlobals();
});

describe("clave segura antes de enviar un pago", () => {
  it("envía una clave UUID v4 en HTTP sin randomUUID", async () => {
    vi.stubGlobal("crypto", { getRandomValues: vi.fn((bytes: Uint8Array) => bytes.fill(0xff)) });
    vi.mocked(registerPayment).mockResolvedValue({ id: "payment-a" } as Awaited<ReturnType<typeof registerPayment>>);
    const { result } = setup();

    await act(async () => { await result.current.mutateAsync(input); });

    expect(registerPayment).toHaveBeenCalledOnce();
    expect(registerPayment).toHaveBeenCalledWith({ ...options, input, idempotencyKey: "ffffffff-ffff-4fff-bfff-ffffffffffff" });
  });

  it("sin CSPRNG entrega un error al guard del formulario y no envía el pago", async () => {
    vi.stubGlobal("crypto", {});
    const { result } = setup();
    let formError: string | null = null;

    await act(async () => {
      try {
        await result.current.mutateAsync(input);
      } catch (error) {
        formError = error instanceof Error ? error.message : "No pudimos registrar el pago.";
      }
    });

    expect(formError).toContain("No pudimos generar una clave segura para el pago.");
    expect(registerPayment).not.toHaveBeenCalled();
  });
});
