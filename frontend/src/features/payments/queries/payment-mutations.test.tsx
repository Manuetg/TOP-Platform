import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPayment, savePaymentPlan } from "../api/payment-api";
import { useRegisterPayment, useSavePaymentPlan } from "./use-booking-finances";

vi.mock("../api/payment-api", () => ({ registerPayment: vi.fn(), savePaymentPlan: vi.fn() }));
const options = { businessId: "business-a", bookingId: "booking-a", accessToken: "synthetic-token" };
const input = { amountMinor: 1, method: "CASH" as const, paidAt: "2026-10-02T12:00:00.000Z" };
const keys = [
  ["payments", "balance", "business-a", "booking-a"],
  ["payments", "plan", "business-a", "booking-a"],
  ["payments", "history", "business-a", "booking-a"],
  ["outstanding-balance", "user-a", "business-a", "booking-a"],
  ["payment-history", "user-a", "business-a", "booking-a"],
  ["bookings", "business-a", "booking-a"],
  ["bookings", "business-a", "PENDING", "", ""],
  ["availability", "calendar", "business-a", "2026-10-01", "2026-11-01"],
  ["dashboard", "business-a", "2026-10-01", "2026-11-01"],
];
const otherKeys = [
  ["payments", "balance", "business-a", "booking-b"],
  ["outstanding-balance", "user-a", "business-a", "booking-b"],
  ["payment-history", "user-a", "business-b", "booking-a"],
  ["payments", "balance", "business-b", "booking-a"],
  ["bookings", "business-b", "booking-a"],
  ["availability", "calendar", "business-b", "2026-10-01", "2026-11-01"],
  ["dashboard", "business-b", "2026-10-01", "2026-11-01"],
];

beforeEach(() => { vi.mocked(registerPayment).mockReset(); vi.mocked(savePaymentPlan).mockReset(); });

describe("pago y actualización del estado operativo", () => {
  function setup() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } } });
    for (const key of [...keys, ...otherKeys]) client.setQueryData(key, { status: "PENDING" });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    return { client, ...renderHook((current) => useRegisterPayment(current), { initialProps: options, wrapper }) };
  }

  it("invalida saldo, historial, reserva, filtros Pendiente, calendario y dashboard del negocio al registrar un pago", async () => {
    vi.mocked(registerPayment).mockResolvedValue({ id: "payment-1" } as Awaited<ReturnType<typeof registerPayment>>);
    const { client, result } = setup();
    await act(async () => { await result.current.mutateAsync(input); });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(registerPayment).toHaveBeenCalledWith(expect.objectContaining({ ...options, input, idempotencyKey: expect.any(String) }));
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of otherKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("un rechazo no confirma ni invalida la reserva y permite reintentar", async () => {
    vi.mocked(registerPayment).mockRejectedValueOnce(new Error("Pago rechazado")).mockResolvedValueOnce({ id: "payment-2" } as Awaited<ReturnType<typeof registerPayment>>);
    const { client, result } = setup();
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow("Pago rechazado"); });
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(client.getQueryData(["bookings", "business-a", "booking-a"])).toEqual({ status: "PENDING" });
    await act(async () => { await result.current.mutateAsync(input); });
    expect(client.getQueryState(["bookings", "business-a", "booking-a"])?.isInvalidated).toBe(true);
    client.clear();
  });

  it("si el servidor registra pero se pierde la respuesta, el reintento conserva la clave y no agrega otro pago", async () => {
    const recorded = new Map<string, Awaited<ReturnType<typeof registerPayment>>>();
    let dropResponse = true;
    vi.mocked(registerPayment).mockImplementation(async (request) => {
      if (recorded.has(request.idempotencyKey)) return recorded.get(request.idempotencyKey)!;
      const payment = { id: `payment-${recorded.size + 1}` } as Awaited<ReturnType<typeof registerPayment>>;
      recorded.set(request.idempotencyKey, payment);
      if (dropResponse) { dropResponse = false; throw new TypeError("Respuesta perdida"); }
      return payment;
    });
    const { client, result } = setup();
    await act(async () => { await expect(result.current.mutateAsync(input)).rejects.toThrow("Respuesta perdida"); });
    expect(registerPayment).toHaveBeenCalledOnce();
    expect(recorded.size).toBe(1);
    const firstKey = vi.mocked(registerPayment).mock.calls[0][0].idempotencyKey;
    await act(async () => { await result.current.mutateAsync(input); });
    expect(vi.mocked(registerPayment).mock.calls[1][0].idempotencyKey).toBe(firstKey);
    expect(recorded.size).toBe(1);
    // Otro cobro legítimo con el mismo importe recibe una clave nueva después del éxito.
    await act(async () => { await result.current.mutateAsync(input); });
    expect(vi.mocked(registerPayment).mock.calls[2][0].idempotencyKey).not.toBe(firstKey);
    expect(recorded.size).toBe(2);
    client.clear();
  });

  it("cambiar el payload o salir y volver al contexto inicia otra intención", async () => {
    vi.mocked(registerPayment).mockRejectedValue(new Error("Red no disponible"));
    const { client, result, rerender } = setup();
    async function reject(value = input) {
      await act(async () => { await expect(result.current.mutateAsync(value)).rejects.toThrow("Red no disponible"); });
      return vi.mocked(registerPayment).mock.lastCall![0].idempotencyKey;
    }
    const first = await reject();
    expect(await reject()).toBe(first);
    const changed = await reject({ ...input, amountMinor: 2 });
    expect(changed).not.toBe(first);
    const restored = await reject();
    expect(restored).not.toBe(first);
    rerender({ ...options, businessId: "business-b", bookingId: "booking-b" });
    rerender(options);
    expect(await reject()).not.toBe(restored);
    expect(registerPayment).toHaveBeenCalledTimes(5);
    client.clear();
  });

  it("una respuesta tardía actualiza el contexto que envió el pago y conserva las queries del negocio nuevo", async () => {
    let resolve!: (payment: Awaited<ReturnType<typeof registerPayment>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof registerPayment>>>((done) => { resolve = done; });
    vi.mocked(registerPayment).mockReturnValueOnce(pending);
    const { client, result, rerender } = setup();
    let completion!: Promise<Awaited<ReturnType<typeof registerPayment>>>;
    await act(async () => { completion = result.current.mutateAsync(input); });
    rerender({ ...options, businessId: "business-b", bookingId: "booking-b" });
    await act(async () => { resolve({ id: "payment-a" } as Awaited<ReturnType<typeof registerPayment>>); await completion; });
    expect(registerPayment).toHaveBeenCalledWith(expect.objectContaining({ businessId: "business-a", bookingId: "booking-a" }));
    for (const key of keys) expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of otherKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    client.clear();
  });

  it("un plan guardado después de cambiar reserva invalida sólo la cuenta que envió el plan", async () => {
    let resolve!: (plan: Awaited<ReturnType<typeof savePaymentPlan>>) => void;
    const pending = new Promise<Awaited<ReturnType<typeof savePaymentPlan>>>((done) => { resolve = done; });
    vi.mocked(savePaymentPlan).mockReturnValueOnce(pending);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
    for (const key of [...keys, ...otherKeys]) client.setQueryData(key, { status: "CONFIRMED" });
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
    const { result, rerender } = renderHook((current) => useSavePaymentPlan(current), { initialProps: options, wrapper });
    let completion!: Promise<Awaited<ReturnType<typeof savePaymentPlan>>>;
    const request = { input: { installments: [{ amountMinor: 1, dueDate: null }] }, replace: true };
    await act(async () => { completion = result.current.mutateAsync(request); });
    rerender({ ...options, bookingId: "booking-b" });
    await act(async () => { resolve({ id: "plan-a" } as Awaited<ReturnType<typeof savePaymentPlan>>); await completion; });
    expect(savePaymentPlan).toHaveBeenCalledWith(expect.objectContaining({ ...options, ...request }));
    for (const key of keys.filter((item) => ["payments", "outstanding-balance", "payment-history"].includes(item[0]))) {
      expect(client.getQueryState(key)?.isInvalidated).toBe(true);
    }
    for (const key of otherKeys) expect(client.getQueryState(key)?.isInvalidated).toBe(false);
    expect(client.getQueryState(["bookings", "business-a", "booking-a"])?.isInvalidated).toBe(false);
    client.clear();
  });
});
