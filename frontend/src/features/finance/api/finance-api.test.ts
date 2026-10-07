import { afterEach, expect, it, vi } from "vitest";
import { configureUnauthorizedRecovery } from "../../../shared/api/api-client";
import { executeFinanceCommand, exportFinanceReport, getFinanceExpense, getFinanceReport } from "./finance-api";
const context = { businessId: "synthetic-a", userId: "owner-a", accessToken: "synthetic-token" };
const period = { from: "2026-09-01", to: "2026-10-01" };
afterEach(() => { configureUnauthorizedRecovery(null); vi.unstubAllGlobals(); });
it("transporta importe PYG exacto y key y no repite mutación tras401", async () => {
  const recover = vi.fn().mockResolvedValue("new-session"); configureUnauthorizedRecovery({ recover });
  const fetch = vi.fn().mockResolvedValue(new Response('{"message":"Sesión vencida"}', { status: 401 })); vi.stubGlobal("fetch", fetch);
  const command = { type: "TRANSFER" as const, fromAccountId: "cash-a", toAccountId: "bank-a", amountMinor: 450000, occurredAt: "2026-10-01T10:00:00.000Z", reason: "Movimiento sintético" };
  await expect(executeFinanceCommand(context, command, "synthetic-key")).rejects.toMatchObject({ status: 401 });
  expect(fetch).toHaveBeenCalledOnce(); expect(recover).not.toHaveBeenCalled();
  const request = fetch.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(request.body as string)).toEqual(command); expect(new Headers(request.headers).get("Idempotency-Key")).toBe("synthetic-key");
});
it("exporta texto CSV del token y corte consultados mediante API compartida", async () => {
  const csv = "id,amountMinor\nexpense-a,900000\n";
  const fetch = vi.fn().mockResolvedValue(new Response(csv, { headers: { "Content-Type": "text/csv" } })); vi.stubGlobal("fetch", fetch);
  await expect(exportFinanceReport(context, period, "token/synthetic")).resolves.toBe(csv);
  const url = new URL(fetch.mock.calls[0][0], "http://localhost");
  expect(url.searchParams.get("token")).toBe("token/synthetic"); expect(url.searchParams.get("from")).toBe(period.from); expect(url.searchParams.get("to")).toBe(period.to);
  expect(fetch.mock.calls[0][1]).not.toHaveProperty("responseType");
});
it.each([403, 409])("exportación conserva errorHTTP %s y no fabrica archivo", async (status) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"message":"Reporte rechazado"}', { status })));
  await expect(exportFinanceReport(context, period, "old-token")).rejects.toMatchObject({ status });
});
it("propaga la cancelación de la consulta del negocio anterior", async () => {
  const abort = new AbortController(); abort.abort(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  await expect(getFinanceReport(context, period, abort.signal)).rejects.toMatchObject({ name: "AbortError" }); expect(fetch).not.toHaveBeenCalled();
});
it("descarta una respuesta200 con negocio o corte ajeno", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ businessId: "synthetic-other", ...period, currency: "PYG", balanceSources: [] }))));
  await expect(getFinanceReport(context, period)).rejects.toMatchObject({ name: "ApiResponseError" });
});
it.each([
  undefined,
  {},
  { id: "broken", version: 1, type: "CREATE_CATALOG" },
  { id: "da6313a0-1508-4ba2-b85f-c82f684c4b93", version: 0, type: "CREATE_CATALOG" },
  { id: "da6313a0-1508-4ba2-b85f-c82f684c4b93", version: 1.5, type: "CREATE_CATALOG" },
  { id: "da6313a0-1508-4ba2-b85f-c82f684c4b93", version: 1, type: "CREATE_EXPENSE" },
])("rechaza un éxito que no acredita el comando registrado: %j", async (result) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(result === undefined ? new Response(null, { status: 204 }) : new Response(JSON.stringify(result))));
  await expect(executeFinanceCommand(context, { type: "CREATE_CATALOG", kind: "CATEGORY", name: "Sintética" }, "synthetic-key")).rejects.toMatchObject({ name: "ApiResponseError" });
});
it("acepta resultado UUID, versión y tipo del comando solicitado", async () => {
  const result = { id: "da6313a0-1508-4ba2-b85f-c82f684c4b93", version: 2, type: "CREATE_CATALOG" };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(result))));
  await expect(executeFinanceCommand(context, { type: "CREATE_CATALOG", kind: "CATEGORY", name: "Sintética" }, "synthetic-key")).resolves.toEqual(result);
});
it.each([{ id: "other-expense", version: 3 }, { id: "expense-a", version: 0 }, { id: "expense-a", version: 1.5 }])("detalle ajeno o sin versión válida no reemplaza el origen solicitado: %j", async (expense) => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ expense, audit: [] }))));
  await expect(getFinanceExpense(context, "expense-a")).rejects.toMatchObject({ name: "ApiResponseError" });
});
