import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import * as auth from "../../auth/context/AuthContext";
import * as business from "../../business/context/BusinessContext";
import type { MembershipRole } from "../../auth/types/auth.types";
import { formatMoney } from "../../../shared/utils/money";
import { FinancePage } from "./FinancePage";
import { financeFixture } from "./finance.fixture";
const clients: QueryClient[] = [];
const fixture = financeFixture();
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
function identity(role: MembershipRole = "OWNER", id = "synthetic-a") {
  vi.spyOn(auth, "useAuth").mockReturnValue({ status: "authenticated", isAuthenticated: true, isLoggingOut: false, establishSession: vi.fn(), updateUserProfile: vi.fn(), logout: async () => undefined,
    session: { user: { id: "owner-a", email: "owner@example.test", status: "ACTIVE" }, accessToken: "synthetic-token", refreshToken: "synthetic-refresh", tokenType: "Bearer", expiresIn: 900, memberships: [{ businessId: id, role }] } });
  vi.spyOn(business, "useBusinessContext").mockReturnValue({ activeBusinessId: id, activeRole: role, activeMembership: { businessId: id, role }, activeBusiness: { id, name: "Negocio sintético", currency: "PYG", timezone: "America/Asuncion", status: "ACTIVE", legalName: null, taxId: null, createdAt: "2026-09-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" }, businesses: [], status: "ready", error: null, selectBusiness: vi.fn(), retry: vi.fn() });
}
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } }); clients.push(client);
  return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/app/finance?from=2026-09-01&to=2026-10-01"]}><NavigationProbe /><FinancePage /></MemoryRouter></QueryClientProvider>);
}
function NavigationProbe() {
  navigateForTest = useNavigate();
  return <button onClick={() => navigateForTest("/app/finance?from=2026-08-01&to=2026-09-01")}>Otro período sintético</button>;
}
let navigateForTest: ReturnType<typeof useNavigate>;
const resultId = "da6313a0-1508-4ba2-b85f-c82f684c4b93";
beforeEach(() => { identity(); vi.stubGlobal("fetch", vi.fn().mockImplementation(async (_url, request) => request?.method === "POST" ? json({ id: resultId, version: 1, type: "CREATE_EXPENSE" }) : json(fixture))); });
afterEach(() => { cleanup(); clients.splice(0).forEach((client) => client.clear()); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("muestra gasto, pago parcial, obligación y caja separados con corte explícito", async () => {
  mount(); expect(await screen.findByRole("heading", { name: "Gastos y obligaciones" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Pendiente actual de estos gastos/ })).toHaveTextContent(formatMoney(600000));
  expect(screen.getByRole("button", { name: /Saldo registrado al corte/ })).toHaveTextContent(formatMoney(700000));
  expect(screen.getByText(/No representan deuda histórica/)).toBeInTheDocument(); expect(screen.getByText(/Este reporte registra operaciones/)).toBeInTheDocument();
  expect(screen.getByText("Evidencia faltante")).toBeInTheDocument();
});
it.each(["ADMIN", "RECEPTIONIST", "VIEWER"] as const)("default-deny para%s sin solicitar datos Finance", async (role) => {
  identity(role); mount(); expect(screen.getByRole("alert")).toHaveTextContent("No tienes permiso"); expect(fetch).not.toHaveBeenCalled();
});
it("captura un gasto PYG con líneas exactas sin crear Payment de huéspedes", async () => {
  const snapshot = financeFixture(); snapshot.resources.push({ id: "resource-history", name: "Cabaña histórica", active: false });
  vi.mocked(fetch).mockImplementation(async (_url, request) => request?.method === "POST" ? json({ id: resultId, version: 1, type: "CREATE_EXPENSE" }) : json(snapshot));
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar gasto" }));
  const dialog = screen.getByRole("dialog", { name: "Registrar gasto" });
  await user.type(within(dialog).getByLabelText("Descripción del gasto"), "Trabajo sintético");
  await user.type(within(dialog).getByRole("textbox", { name: "Total del documento, guaraníes PYG" }), "900.000");
  await user.type(within(dialog).getByLabelText("Concepto"), "Reparación");
  await user.type(within(dialog).getByRole("textbox", { name: "Importe de la línea, guaraníes PYG" }), "900.000");
  await user.selectOptions(within(dialog).getByLabelText("Categoría"), "category-a");
  expect(within(dialog).getByRole("option", { name: "Cabaña histórica · no activo" })).toBeEnabled();
  await user.selectOptions(within(dialog).getByLabelText("Recurso"), "resource-history");
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await screen.findByText(/Registro guardado/);
  const call = vi.mocked(fetch).mock.calls.find(([, request]) => request?.method === "POST")!;
  expect(String(call[0])).toContain("/finance/commands"); expect(JSON.parse(call[1]!.body as string)).toMatchObject({ type: "CREATE_EXPENSE", amountMinor: 900000, settlement: null, lines: [{ amountMinor: 900000, resourceId: "resource-history", operational: true }] });
});
it("conflicto conserva borrador, consulta nueva versión y confirma una intención nueva", async () => {
  let first = true;
  vi.mocked(fetch).mockImplementation(async (url, request) => {
    if (String(url).includes("/expenses/expense-a")) return json({ expense: { ...fixture.expenses[0], version: 3, outstandingMinor: 500000 }, audit: [] });
    if (request?.method !== "POST") return json(fixture);
    if (first) { first = false; return json({ message: "Versión desactualizada" }, 409); }
    return json({ id: resultId, version: 4, type: "SETTLE_EXPENSE" });
  });
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
  const dialog = screen.getByRole("dialog"); await user.selectOptions(within(dialog).getByLabelText("Cuenta"), "account-a");
  await user.type(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" }), "300.000");
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent("La información cambió");
  expect(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" })).toHaveValue("300.000"); expect(screen.queryByText(/Registro guardado/)).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Consultar versión actual" }));
  await within(dialog).findByText(/Consultaste la versión actual/);
  expect(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" })).toHaveValue("300.000");
  await user.click(within(dialog).getByRole("button", { name: "Confirmar nuevo intento" })); await screen.findByText(/Registro guardado/);
  const calls = vi.mocked(fetch).mock.calls.filter(([, request]) => request?.method === "POST");
  expect(JSON.parse(calls[0][1]!.body as string).expectedVersion).toBe(2); expect(JSON.parse(calls[1][1]!.body as string).expectedVersion).toBe(3);
  expect(new Headers(calls[0][1]!.headers).get("Idempotency-Key")).not.toBe(new Headers(calls[1][1]!.headers).get("Idempotency-Key"));
});
it("respuesta perdida bloquea otro payload y reintenta con misma clave", async () => {
  let drop = true;
  vi.mocked(fetch).mockImplementation(async (_url, request) => {
    if (request?.method !== "POST") return json(fixture);
    if (drop) { drop = false; throw new TypeError("Respuesta perdida sintética"); }
    return json({ id: resultId, version: 1, type: "SETTLE_EXPENSE" });
  });
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
  const dialog = screen.getByRole("dialog"); await user.selectOptions(within(dialog).getByLabelText("Cuenta"), "account-a");
  await user.type(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" }), "300.000");
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await within(dialog).findByText("Resultado pendiente de verificar"); expect(within(dialog).getByLabelText("Cuenta")).toBeDisabled();
  await user.click(within(dialog).getByRole("button", { name: "Reintentar el mismo registro" })); await screen.findByText(/Registro guardado/);
  const calls = vi.mocked(fetch).mock.calls.filter(([, request]) => request?.method === "POST"); expect(calls).toHaveLength(2);
  expect(calls[0][1]!.body).toBe(calls[1][1]!.body); expect(new Headers(calls[0][1]!.headers).get("Idempotency-Key")).toBe(new Headers(calls[1][1]!.headers).get("Idempotency-Key"));
});
it("Escape cancela y devuelve foco sin emitir operación", async () => {
  const user = userEvent.setup(); mount(); const trigger = await screen.findByRole("button", { name: "Registrar gasto" }); await user.click(trigger);
  await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(trigger).toHaveFocus();
  expect(vi.mocked(fetch).mock.calls.filter(([, request]) => request?.method === "POST")).toHaveLength(0);
});
it("cerrar y reabrir conserva el borrador en el mismo negocio", async () => {
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar gasto" }));
  await user.type(screen.getByLabelText("Descripción del gasto"), "Borrador sintético");
  await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Registrar gasto" })); expect(screen.getByLabelText("Descripción del gasto")).toHaveValue("Borrador sintético");
});
it("un borrador sin enviar conserva el texto y permite la categoría y cuenta con apertura creadas después de cerrarlo", async () => {
  const snapshot = financeFixture(); snapshot.catalogs = []; snapshot.accounts = [];
  vi.mocked(fetch).mockImplementation(async (_url, request) => {
    if (request?.method !== "POST") return json(snapshot);
    const command = JSON.parse(request.body as string);
    if (command.type === "CREATE_CATALOG") snapshot.catalogs = [{ ...fixture.catalogs[0], id: "category-new", name: command.name, kind: "CATEGORY", version: 1 }];
    if (command.type === "CREATE_ACCOUNT") snapshot.accounts = [{ ...fixture.accounts[0], id: "account-new", name: command.name, opening: { id: "opening-new", ...command.opening }, version: 1 }];
    return json({ id: resultId, version: 1, type: command.type });
  });
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar gasto" }));
  await user.type(screen.getByLabelText("Descripción del gasto"), "Borrador antes de catálogos");
  await user.type(screen.getByRole("textbox", { name: "Total del documento, guaraníes PYG" }), "900000");
  await user.tab();
  await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Cuentas y catálogos" }));
  await user.click(screen.getByRole("button", { name: "Agregar categoría o contraparte" }));
  await user.type(screen.getByLabelText("Nombre"), "Reparación nueva"); await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Agregar cuenta" })); await user.type(screen.getByLabelText("Nombre"), "Caja nueva");
  await user.type(screen.getByRole("textbox", { name: "Saldo de apertura, guaraníes PYG" }), "1000000");
  await user.type(screen.getByLabelText("Motivo"), "Apertura declarada");
  await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Registrar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Gastos" }));
  await user.click(screen.getByRole("button", { name: "Registrar gasto" }));
  const reopened = screen.getByRole("dialog"); expect(within(reopened).getByLabelText("Descripción del gasto")).toHaveValue("Borrador antes de catálogos");
  expect(within(reopened).getByRole("textbox", { name: "Total del documento, guaraníes PYG" })).toHaveValue("900.000");
  await user.selectOptions(within(reopened).getByLabelText("Categoría"), "category-new");
  await user.click(within(reopened).getByLabelText("Ya realicé un pago de este gasto"));
  await user.selectOptions(within(reopened).getByLabelText("Cuenta"), "account-new");
  expect(within(reopened).getByLabelText("Categoría")).toHaveValue("category-new"); expect(within(reopened).getByLabelText("Cuenta")).toHaveValue("account-new");
  expect(postCalls()).toHaveLength(2); expect(postCalls().map(([, request]) => JSON.parse(request!.body as string).type)).toEqual(["CREATE_CATALOG", "CREATE_ACCOUNT"]);
});
it("una respuesta vieja no aparece al cambiar negocio", async () => {
  let resolve!: (value: Response) => void; vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValue(json({ ...financeFixture("synthetic-b"), expenses: [], accounts: [], totals: { ...fixture.totals, outstandingMinor: 0 } }));
  const view = mount(); await screen.findByText(/Cargando Finanzas/); identity("OWNER", "synthetic-b");
  view.rerender(<QueryClientProvider client={clients[0]}><MemoryRouter><FinancePage /></MemoryRouter></QueryClientProvider>);
  await act(async () => resolve(json(fixture))); await screen.findByRole("heading", { name: "Gastos y obligaciones" });
  expect(screen.queryByText("Reparación sintética pendiente")).not.toBeInTheDocument();
});
it("reconstruye saldo con apertura y cobro anterior al período y abre auditoría real del endpoint", async () => {
  const snapshot = financeFixture(); snapshot.accounts[0] = { ...snapshot.accounts[0], balanceMinor: 1200000, opening: { ...snapshot.accounts[0].opening!, occurredAt: "2026-08-01T12:00:00.000Z" } };
  snapshot.balanceSources[0].occurredAt = "2026-08-01T12:00:00.000Z";
  snapshot.balanceSources.push({ id: "old-payment", sourceType: "PAYMENT", sourceId: "old-payment", sourceVersion: 1, accountId: "account-a", amountMinor: 500000, occurredAt: "2026-08-20T12:00:00.000Z", description: "Cobro previo sintético", includedInBalance: true, reviewed: true, reviewVersion: 1, reviewStale: false, bookingId: "booking-old", reviewDetails: { actorUserId: "owner-review", occurredAt: "2026-09-01T12:00:00.000Z", reason: "Soporte previo" } });
  snapshot.payments = []; snapshot.totals.paymentsMinor = 0; snapshot.totals.registeredBalanceMinor = 1200000;
  vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/audit/PAYMENT/old-payment") ? json([{ id: "audit-old", action: "LINK_PAYMENT", sourceId: "old-payment", actorUserId: "owner-a", occurredAt: "2026-09-01T12:00:00.000Z", details: { command: { reason: "Vínculo sintético" }, result: { id: "old-payment", version: 1 } } }]) : json(snapshot));
  const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: /Saldo registrado al corte/ }));
  await user.click(screen.getByRole("button", { name: "Ver origen del saldo" }));
  const dialog = screen.getByRole("dialog", { name: "Origen del saldo registrado" });
  expect(within(dialog).getByText(/incluidos los anteriores al inicio del filtro/)).toBeInTheDocument();
  expect(snapshot.balanceSources.reduce((sum, item) => sum + BigInt(item.amountMinor), 0n)).toBe(1200000n);
  expect(within(dialog).getByText(formatMoney(1000000))).toBeInTheDocument(); expect(within(dialog).getByText(formatMoney(-300000))).toBeInTheDocument(); expect(within(dialog).getByText(formatMoney(500000))).toBeInTheDocument();
  const row = within(dialog).getByText(/Cobro previo sintético/).closest("li")!; const trigger = within(row).getByRole("button", { name: "Ver origen e historial" }); await user.click(trigger);
  const history = screen.getByRole("dialog", { name: "Origen e historial del movimiento" });
  expect(await within(history).findByText("Motivo: Vínculo sintético")).toBeInTheDocument(); expect(within(history).getByText(/owner-review/)).toHaveTextContent("Soporte previo");
  expect(within(history).getByRole("link", { name: "Abrir cobro original de la reserva" })).toHaveAttribute("href", "/app/bookings/booking-old/payments");
  await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog", { name: "Origen e historial del movimiento" })).not.toBeInTheDocument()); expect(trigger).toHaveFocus();
});
it("historial de transferencia muestra actor, fecha y motivo del contrato público", async () => {
  const snapshot = financeFixture(); snapshot.movements = [{ ...snapshot.movements[0], id: "transfer-a:debit", sourceType: "TRANSFER", sourceId: "transfer-a", description: "Transferencia sintética", amountMinor: -300000 }];
  vi.mocked(fetch).mockImplementation(async (url) => String(url).includes("/audit/TRANSFER/transfer-a") ? json([{ id: "audit-transfer", action: "TRANSFER", sourceId: "transfer-a", actorUserId: "actor-transfer", occurredAt: "2026-09-30T12:00:00.000Z", details: { command: { reason: "Traslado sintético de efectivo" }, result: { id: "transfer-a", version: 1 } } }]) : json(snapshot));
  const user = userEvent.setup(); mount(); await screen.findByRole("heading", { name: "Gastos y obligaciones" });
  await user.click(screen.getByRole("button", { name: "Movimientos y arqueos" })); await user.click(screen.getByRole("button", { name: "Ver origen e historial" }));
  const dialog = screen.getByRole("dialog", { name: "Origen e historial del movimiento" });
  expect(await within(dialog).findByText("Motivo: Traslado sintético de efectivo")).toBeInTheDocument(); expect(within(dialog).getByText(/actor-transfer/)).toHaveTextContent("30/09/2026, 09:00");
});
it("rechazo de histórico no PYG conserva motivo de lectura y no inventa totales", async () => {
  vi.mocked(fetch).mockResolvedValue(json({ message: "Los cobros históricos no PYG requieren revisión. No se realiza conversión." }, 409));
  mount(); expect(await screen.findByRole("alert")).toHaveTextContent("Los cobros históricos no PYG requieren revisión");
  expect(screen.queryByRole("button", { name: /Saldo registrado al corte/ })).not.toBeInTheDocument();
});
async function prepareSettlement() {
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
  const dialog = screen.getByRole("dialog", { name: "Registrar pago del gasto" });
  await user.selectOptions(within(dialog).getByLabelText("Cuenta"), "account-a");
  await user.type(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" }), "300.000");
  return { user, dialog };
}
function postCalls() { return vi.mocked(fetch).mock.calls.filter(([, request]) => request?.method === "POST"); }
it("un pago sin apertura explica el paso pendiente, deshabilita esa cuenta y conserva el foco sin POST", async () => {
  const snapshot = financeFixture(); snapshot.accounts[0].opening = null; snapshot.accounts[0].balanceMinor = null;
  vi.mocked(fetch).mockResolvedValue(json(snapshot)); const user = userEvent.setup(); mount();
  const trigger = await screen.findByRole("button", { name: "Registrar pago" }); await user.click(trigger); const dialog = screen.getByRole("dialog");
  const account = within(dialog).getByLabelText("Cuenta"); expect(within(dialog).getByRole("option", { name: "Caja sintética · sin apertura" })).toBeDisabled();
  expect(account).toHaveAccessibleDescription("Registra primero la apertura en Cuentas y catálogos para usar una cuenta en esta operación.");
  await user.type(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" }), "300000"); await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  expect(postCalls()).toHaveLength(0); await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument()); expect(trigger).toHaveFocus();
  await user.click(screen.getByRole("button", { name: "Cuentas y catálogos" })); await user.click(screen.getByRole("button", { name: "Registrar apertura" }));
  expect(screen.getByRole("dialog", { name: "Registrar apertura" })).toBeInTheDocument(); expect(screen.getByRole("textbox", { name: "Saldo de apertura, guaraníes PYG" })).toBeEnabled();
});
it("una cuenta con apertura y saldo negativo sigue disponible para registrar un pago", async () => {
  const snapshot = financeFixture(); snapshot.accounts[0].balanceMinor = -1000; snapshot.accounts[0].negative = true;
  vi.mocked(fetch).mockResolvedValue(json(snapshot)); const user = userEvent.setup(); mount(); await user.click(await screen.findByRole("button", { name: "Registrar pago" }));
  const dialog = screen.getByRole("dialog"); expect(within(dialog).getByRole("option", { name: "Caja sintética" })).toBeEnabled();
  await user.selectOptions(within(dialog).getByLabelText("Cuenta"), "account-a"); expect(within(dialog).getByLabelText("Cuenta")).toHaveValue("account-a");
});
it("commit con respuesta perdida conserva formulario, clave y único hecho tras fallo de GET y cierre/reapertura", async () => {
  const facts = new Map<string, string>(); let lostResponse = true; let failRead = false;
  vi.mocked(fetch).mockImplementation(async (_url, request) => {
    if (request?.method !== "POST") return failRead ? json({ message: "Lectura interrumpida" }, 500) : json(fixture);
    const key = new Headers(request.headers).get("Idempotency-Key")!;
    if (!facts.has(key)) facts.set(key, request.body as string);
    if (lostResponse) { lostResponse = false; throw new TypeError("Commit realizado con respuesta perdida"); }
    expect(request.body).toBe(facts.get(key));
    return json({ id: resultId, version: 3, type: "SETTLE_EXPENSE" });
  });
  const { user, dialog } = await prepareSettlement();
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await within(dialog).findByText("Resultado pendiente de verificar");
  failRead = true;
  await act(async () => { await clients[0].invalidateQueries({ queryKey: ["finance", "owner-a", "synthetic-a", "report"] }); });
  expect(screen.getByRole("dialog", { name: "Registrar pago del gasto" })).toBe(dialog);
  expect(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" })).toHaveValue("300.000");
  await waitFor(() => expect(document.querySelector(".finance-state--error")).toHaveTextContent("El servicio no pudo completar la solicitud"));
  await user.keyboard("{Escape}"); await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  await user.click(screen.getByRole("button", { name: "Recuperar registro pendiente" }));
  const reopened = screen.getByRole("dialog", { name: "Registrar pago del gasto" });
  expect(within(reopened).getByLabelText("Cuenta")).toBeDisabled();
  await user.click(within(reopened).getByRole("button", { name: "Reintentar el mismo registro" }));
  await screen.findByText("Registro guardado.");
  expect(screen.queryByText(/El reporte se actualizó/)).not.toBeInTheDocument();
  expect(postCalls()).toHaveLength(2); expect(facts.size).toBe(1);
  expect(postCalls()[0][1]!.body).toBe(postCalls()[1][1]!.body);
  expect(new Headers(postCalls()[0][1]!.headers).get("Idempotency-Key")).toBe(new Headers(postCalls()[1][1]!.headers).get("Idempotency-Key"));
});
it("Back/Forward a un período sin caché no desmonta una intención incierta durante loading", async () => {
  let lostResponse = true; let finishRead!: (response: Response) => void;
  vi.mocked(fetch).mockImplementation(async (url, request) => {
    if (request?.method === "POST") {
      if (lostResponse) { lostResponse = false; throw new TypeError("Respuesta perdida"); }
      return json({ id: resultId, version: 3, type: "SETTLE_EXPENSE" });
    }
    if (String(url).includes("from=2026-08-01")) return new Promise((resolve) => { finishRead = resolve; });
    return json(fixture);
  });
  const { user, dialog } = await prepareSettlement();
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await within(dialog).findByText("Resultado pendiente de verificar");
  await act(async () => { await navigateForTest("/app/finance?from=2026-08-01&to=2026-09-01"); });
  await screen.findByText(/Cargando Finanzas/);
  expect(screen.getByRole("dialog", { name: "Registrar pago del gasto" })).toBe(dialog);
  expect(within(dialog).getByLabelText("Cuenta")).toBeDisabled();
  await act(async () => { finishRead(json({ ...fixture, from: "2026-08-01", to: "2026-09-01" })); });
  await user.click(within(dialog).getByRole("button", { name: "Reintentar el mismo registro" }));
  // Resolve the explicit post-commit report refresh, without creating another intent.
  await act(async () => { finishRead(json({ ...fixture, from: "2026-08-01", to: "2026-09-01" })); });
  await screen.findByText("Registro guardado.");
  expect(postCalls()).toHaveLength(2);
  expect(postCalls()[0][1]!.body).toBe(postCalls()[1][1]!.body);
  expect(new Headers(postCalls()[0][1]!.headers).get("Idempotency-Key")).toBe(new Headers(postCalls()[1][1]!.headers).get("Idempotency-Key"));
});
it.each([204, 200])("éxito inválido HTTP%s conserva intento y no anuncia guardado hasta recuperar su respuesta válida", async (status) => {
  let invalid = true;
  vi.mocked(fetch).mockImplementation(async (_url, request) => {
    if (request?.method !== "POST") return json(fixture);
    if (invalid) { invalid = false; return status === 204 ? new Response(null, { status }) : json({}); }
    return json({ id: resultId, version: 3, type: "SETTLE_EXPENSE" });
  });
  const { user, dialog } = await prepareSettlement();
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await within(dialog).findByText("Resultado pendiente de verificar");
  expect(screen.queryByText("Registro guardado.")).not.toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Reintentar el mismo registro" }));
  await screen.findByText("Registro guardado.");
  expect(postCalls()[0][1]!.body).toBe(postCalls()[1][1]!.body);
  expect(new Headers(postCalls()[0][1]!.headers).get("Idempotency-Key")).toBe(new Headers(postCalls()[1][1]!.headers).get("Idempotency-Key"));
});
it("GET de conflicto con otra entidad no cambia id ni versión del borrador", async () => {
  vi.mocked(fetch).mockImplementation(async (url, request) => {
    if (request?.method === "POST") return json({ message: "Versión desactualizada" }, 409);
    if (String(url).includes("/expenses/expense-a")) return json({ expense: { ...fixture.expenses[0], id: "other-expense", version: 3 }, audit: [] });
    return json(fixture);
  });
  const { user, dialog } = await prepareSettlement();
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await within(dialog).findByRole("alert");
  await user.click(within(dialog).getByRole("button", { name: "Consultar versión actual" }));
  await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent("respuesta no válida"));
  expect(within(dialog).getByRole("textbox", { name: "Importe pagado, guaraníes PYG" })).toHaveValue("300.000");
  expect(postCalls()).toHaveLength(1);
  await user.click(within(dialog).getByRole("button", { name: "Registrar" }));
  await waitFor(() => expect(postCalls()).toHaveLength(2));
  expect(JSON.parse(postCalls()[1][1]!.body as string)).toMatchObject({ id: "expense-a", expectedVersion: 2 });
});


it.each([
  { reference: null, evidenceMissing: false, list: "Sin referencia textual; consulta los comprobantes adjuntos.", detail: "Sin referencia textual; consulta los comprobantes adjuntos." },
  { reference: "Comprobante privado QA", evidenceMissing: false, list: "Referencia: Comprobante privado QA", detail: "Referencia privada: Comprobante privado QA" },
  { reference: null, evidenceMissing: true, list: "Evidencia faltante", detail: "Evidencia faltante" },
])("lista y detalle conservan evidencia y referencia sin convertir null en texto ($reference/$evidenceMissing)", async ({ reference, evidenceMissing, list, detail }) => {
  const snapshot = financeFixture(); snapshot.expenses[0] = { ...snapshot.expenses[0], reference, evidenceMissing };
  vi.mocked(fetch).mockImplementation(async (url) => {
    if (String(url).endsWith("/expenses/expense-a/evidence")) return json({ enabled: true, retention: "PRESERVE_WITHOUT_PURGE", fileSizeLimitBytes: 2097152, allowedMimeTypes: ["application/pdf"], files: evidenceMissing ? [] : [{ id: resultId, businessId: "synthetic-a", expenseId: "expense-a", expenseVersion: 2, filename: "Comprobante QA.pdf", mimeType: "application/pdf", sizeBytes: 100, sha256: "a".repeat(64), recordedByUserId: "owner-a", createdAt: "2026-09-30T10:00:00.000Z" }] });
    if (String(url).endsWith("/expenses/expense-a")) return json({ expense: snapshot.expenses[0], audit: [] });
    return json(snapshot);
  });
  const user = userEvent.setup(); mount();
  const trigger = await screen.findByRole("button", { name: snapshot.expenses[0].description });
  const row = trigger.closest("article")!; expect(within(row).getByText(list)).toBeInTheDocument();
  expect(within(row).queryByText(/^Referencia(?: privada)?: null$/)).not.toBeInTheDocument();
  await user.click(trigger); const dialog = screen.getByRole("dialog", { name: "Detalle del gasto" });
  expect(await within(dialog).findByText(detail)).toBeInTheDocument();
  expect(within(dialog).queryByText(/^Referencia(?: privada)?: null$/)).not.toBeInTheDocument();
  if (!evidenceMissing) expect(await within(dialog).findByRole("button", { name: "Descargar Comprobante QA.pdf" })).toBeInTheDocument();
  else expect(within(dialog).queryByRole("button", { name: "Descargar Comprobante QA.pdf" })).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.every(([, request]) => !request?.method || request.method === "GET")).toBe(true);
});
