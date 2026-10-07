import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ApiError, ApiTransportError } from "../../../shared/api/api-client";
import { executeFinanceCommand } from "../api/finance-api";
import { financeKey, useFinanceCommand } from "./use-finance";
import type { FinanceResult } from "../types/finance.types";
vi.mock("../api/finance-api", () => ({ executeFinanceCommand: vi.fn() }));
const context = { businessId: "synthetic-a", userId: "owner-a", accessToken: "synthetic-token" };
const command = { type: "CREATE_CATALOG" as const, kind: "CATEGORY" as const, name: "Limpieza sintética" };
const response: FinanceResult = { id: "category-a", version: 1, type: "CREATE_CATALOG" };
const clients: QueryClient[] = [];
beforeEach(() => vi.mocked(executeFinanceCommand).mockReset()); afterEach(() => clients.splice(0).forEach((client) => client.clear()));
function setup() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  client.setQueryData([...financeKey(context), "report"], {}); client.setQueryData(["finance", "owner-b", "synthetic-b", "report"], {});
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  return { client, ...renderHook((input) => useFinanceCommand(input), { initialProps: context, wrapper }) };
}
it("conserva clave y payload tras resultado incierto y rechaza otra intención silenciosa", async () => {
  vi.mocked(executeFinanceCommand).mockRejectedValueOnce(new ApiTransportError()).mockResolvedValue(response);
  const { result } = setup();
  await act(async () => { await expect(result.current.execute(command)).rejects.toBeInstanceOf(ApiTransportError); });
  expect(result.current.hasUncertainResult).toBe(true); const key = vi.mocked(executeFinanceCommand).mock.calls[0][2];
  await act(async () => { await expect(result.current.execute({ ...command, name: "Otra" })).rejects.toThrow("Primero verifica"); });
  expect(executeFinanceCommand).toHaveBeenCalledOnce();
  await act(async () => { await result.current.retry(); });
  expect(vi.mocked(executeFinanceCommand).mock.calls[1]).toEqual([context, command, key]); expect(result.current.hasUncertainResult).toBe(false);
  await act(async () => { await result.current.execute(command); });
  expect(vi.mocked(executeFinanceCommand).mock.calls[2][2]).not.toBe(key);
});
it("dos clics concurrentes producen una solicitud y una clave", async () => {
  let resolve!: (value: typeof response) => void; vi.mocked(executeFinanceCommand).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result } = setup(); let first!: Promise<typeof response>; let second!: Promise<typeof response>;
  await act(async () => { first = result.current.execute(command); second = result.current.execute(command); });
  expect(first).toBe(second); expect(executeFinanceCommand).toHaveBeenCalledOnce();
  await act(async () => { resolve(response); await first; });
});
it("otro contenido durante el envío no obtiene éxito del registro anterior", async () => {
  let resolve!: (value: FinanceResult) => void; vi.mocked(executeFinanceCommand).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { result } = setup(); let first!: Promise<FinanceResult>;
  await act(async () => { first = result.current.execute(command); });
  await act(async () => { await expect(result.current.execute({ ...command, name: "Otro contenido" })).rejects.toThrow("registro en curso"); });
  expect(executeFinanceCommand).toHaveBeenCalledOnce();
  await act(async () => { resolve(response); await first; });
});
it("un conflicto conserva datos consultados, y401 no reintenta", async () => {
  vi.mocked(executeFinanceCommand).mockRejectedValueOnce(new ApiError(409, "Versión vieja")).mockRejectedValueOnce(new ApiError(401, "Sesión vencida"));
  const { client, result } = setup();
  await act(async () => { await expect(result.current.execute(command)).rejects.toMatchObject({ status: 409 }); });
  expect(client.getQueryState([...financeKey(context), "report"])?.isInvalidated).toBe(false);
  await act(async () => { await expect(result.current.execute(command)).rejects.toMatchObject({ status: 401 }); });
  expect(executeFinanceCommand).toHaveBeenCalledTimes(2); expect(result.current.hasUncertainResult).toBe(false);
});
it("respuesta tardía invalida sólo el negocio e identidad del envío original", async () => {
  let resolve!: (value: typeof response) => void; vi.mocked(executeFinanceCommand).mockReturnValue(new Promise((done) => { resolve = done; }));
  const { client, result, rerender } = setup(); let completion!: Promise<typeof response>;
  await act(async () => { completion = result.current.execute(command); });
  rerender({ ...context, userId: "owner-b", businessId: "synthetic-b" });
  await act(async () => { resolve(response); await completion; });
  await waitFor(() => expect(client.getQueryState([...financeKey(context), "report"])?.isInvalidated).toBe(true));
  expect(client.getQueryState(["finance", "owner-b", "synthetic-b", "report"])?.isInvalidated).toBe(false);
});
it.each([401, 403])("un reintento incierto rechazado con %s conserva intención y usa la sesión vigente sólo al pedirlo", async (status) => {
  vi.mocked(executeFinanceCommand).mockRejectedValueOnce(new ApiTransportError()).mockRejectedValueOnce(new ApiError(status, "Sesión no autorizada")).mockResolvedValue(response);
  const { result, rerender } = setup();
  await act(async () => { await expect(result.current.execute(command)).rejects.toBeInstanceOf(ApiTransportError); });
  const key = vi.mocked(executeFinanceCommand).mock.calls[0][2];
  await act(async () => { await expect(result.current.retry()).rejects.toMatchObject({ status }); });
  expect(result.current.hasUncertainResult).toBe(true);
  rerender({ ...context, accessToken: "synthetic-renewed-token" });
  expect(executeFinanceCommand).toHaveBeenCalledTimes(2);
  await act(async () => { await expect(result.current.execute({ ...command, name: "Otro contenido" })).rejects.toThrow("Primero verifica"); });
  await act(async () => { await result.current.retry(); });
  expect(vi.mocked(executeFinanceCommand).mock.calls[2]).toEqual([{ ...context, accessToken: "synthetic-renewed-token" }, command, key]);
  expect(vi.mocked(executeFinanceCommand).mock.calls[1][2]).toBe(key);
  expect(result.current.hasUncertainResult).toBe(false);
});
it("la incertidumbre de una identidad no se hereda en otra", async () => {
  vi.mocked(executeFinanceCommand).mockRejectedValueOnce(new ApiTransportError()).mockResolvedValue(response);
  const { result, rerender } = setup();
  await act(async () => { await expect(result.current.execute(command)).rejects.toBeInstanceOf(ApiTransportError); });
  const key = vi.mocked(executeFinanceCommand).mock.calls[0][2];
  rerender({ ...context, userId: "owner-b", businessId: "synthetic-b" });
  expect(result.current.hasUncertainResult).toBe(false);
  await act(async () => { await expect(result.current.retry()).rejects.toThrow("No hay un registro pendiente"); });
  expect(executeFinanceCommand).toHaveBeenCalledOnce();
  await act(async () => { await result.current.execute(command); });
  expect(vi.mocked(executeFinanceCommand).mock.calls[1][0]).toMatchObject({ userId: "owner-b", businessId: "synthetic-b" });
  expect(vi.mocked(executeFinanceCommand).mock.calls[1][2]).not.toBe(key);
});
