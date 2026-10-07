import { afterEach, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import type { PaymentPlanInput, RegisterPaymentInput } from "../types/payment.types";
import { registerPayment, savePaymentPlan } from "./payment-api";

const context = { businessId: "business-1", bookingId: "booking-1", accessToken: "original-session-token" };
const key = "c9000000-0000-4000-8000-000000000001";
const payment: RegisterPaymentInput = { amountMinor: 50, method: "CASH", paidAt: "2026-10-02T12:00:00.000Z" };
const plan: PaymentPlanInput = { installments: [{ amountMinor: 50, dueDate: "2026-10-06" }] };

afterEach(() => {
  configureUnauthorizedRecovery(null);
  vi.unstubAllGlobals();
});

it.each([
  { name: "registrar pago", method: "POST", body: payment, send: () => registerPayment({ ...context, input: payment, idempotencyKey: key }) },
  { name: "crear plan", method: "POST", body: plan, send: () => savePaymentPlan({ ...context, input: plan, replace: false }) },
  { name: "reemplazar plan", method: "PUT", body: plan, send: () => savePaymentPlan({ ...context, input: plan, replace: true }) },
])("no repite $name tras 401 con credenciales de otra sesión", async ({ name, method, body, send }) => {
  const recover = vi.fn().mockResolvedValue("other-session-token");
  configureUnauthorizedRecovery({ recover });
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Sesión expirada." }), {
    status: 401, headers: { "Content-Type": "application/json" },
  }));
  vi.stubGlobal("fetch", fetchMock);

  await expect(send()).rejects.toMatchObject({ status: 401, message: "Sesión expirada." });
  expect(fetchMock).toHaveBeenCalledOnce();
  expect(recover).not.toHaveBeenCalled();
  const request = fetchMock.mock.calls[0][1] as RequestInit;
  expect(request.method).toBe(method);
  expect(JSON.parse(request.body as string)).toEqual(body);
  const headers = new Headers(request.headers);
  expect(headers.get("Authorization")).toBe("Bearer original-session-token");
  if (name === "registrar pago") expect(headers.get("Idempotency-Key")).toBe(key);
  expect(request).not.toHaveProperty("skipUnauthorizedRecovery");
});
