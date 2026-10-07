import { expect, it } from "vitest";
import { buildCommand, initialDraft } from "./command-form";
import { financeFixture } from "../pages/finance.fixture";
it("gasto pagado conserva PYG exacto y cuota de costo distinta de settlement", () => {
  const action = { type: "CREATE_EXPENSE" as const }; const draft = initialDraft(action, "2026-09-30");
  const command = buildCommand(action, { ...draft, name: "Trabajo sintético", amount: "900.000", paid: true, accountId: "account-a", paymentAmount: "300.000", occurredAt: "2026-10-01T12:00", lines: [{ label: "Línea", categoryId: "category-a", resourceId: "", amount: "900.000", operational: true }] });
  expect(command).toMatchObject({ amountMinor: 900000, consumedOn: "2026-09-30", lines: [{ amountMinor: 900000, resourceId: null }], settlement: { amountMinor: 300000, occurredAt: "2026-10-01T12:00:00.000Z" } });
});
it("cuenta sin apertura no fabrica monto cero ni fecha", () => {
  const action = { type: "CREATE_ACCOUNT" as const };
  const command = buildCommand(action, { ...initialDraft(action, "2026-10-01"), name: "Banco sintético", kind: "BANK", hasOpening: false, amount: "", occurredAt: "" });
  expect(command).toEqual({ type: "CREATE_ACCOUNT", name: "Banco sintético", kind: "BANK", opening: null });
});
it("corrección conserva apertura original y envía delta firmado", () => {
  const account = financeFixture().accounts[0]; account.opening!.occurredAt = "2026-09-01T12:00:59.123Z";
  const action = { type: "CASH_MOVEMENT" as const, account, openingCorrection: true };
  const command = buildCommand(action, { ...initialDraft(action, "2026-10-01"), amount: "-5.000", reason: "Corrección sintética" });
  expect(command).toMatchObject({ openingId: "opening-a", accountId: "account-a", kind: "ADJUSTMENT", amountMinor: -5000, occurredAt: account.opening!.occurredAt });
});
it.each(["1,5", "1.50", "9007199254740992"])("rechaza importe%s sin redondear", (amount) => {
  const action = { type: "COUNT_CASH" as const }; expect(() => buildCommand(action, { ...initialDraft(action, "2026-10-01"), amount })).toThrow("importe entero");
});
