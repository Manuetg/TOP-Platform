import { parseGuaranies } from "../../../shared/utils/money";
import type { FinanceAccount, FinanceCashCount, FinanceCatalog, FinanceCommand, FinanceExpense, FinanceMovement, FinancePayment } from "../types/finance.types";

export interface FinanceAction {
  type: FinanceCommand["type"]; catalog?: FinanceCatalog; account?: FinanceAccount; expense?: FinanceExpense;
  payment?: FinancePayment; movement?: FinanceMovement; count?: FinanceCashCount;
  openingCorrection?: boolean;
}
export interface LineDraft { label: string; categoryId: string; resourceId: string; amount: string; operational: boolean }
export interface CommandDraft {
  name: string; kind: string; amount: string; date: string; dueOn: string; occurredAt: string; reason: string;
  reference: string; accountId: string; toAccountId: string; counterpartyId: string; hasOpening: boolean;
  paid: boolean; paymentAmount: string; lines: LineDraft[];
}
export const commandTitles: Record<FinanceCommand["type"], string> = {
  CREATE_CATALOG: "Agregar categoría o contraparte", ARCHIVE_CATALOG: "Archivar catálogo",
  CREATE_ACCOUNT: "Agregar cuenta", ARCHIVE_ACCOUNT: "Archivar cuenta", OPEN_ACCOUNT: "Registrar apertura",
  CREATE_EXPENSE: "Registrar gasto", SETTLE_EXPENSE: "Registrar pago del gasto", SET_EVIDENCE: "Actualizar referencia",
  LINK_PAYMENT: "Asignar cobro a cuenta", TRANSFER: "Registrar transferencia interna", CASH_MOVEMENT: "Registrar movimiento",
  REVIEW_MOVEMENT: "Revisar movimiento", COUNT_CASH: "Registrar arqueo", ADJUST_COUNT: "Registrar ajuste del arqueo",
};
export function initialDraft(action: FinanceAction, today: string): CommandDraft {
  return { name: "", kind: action.type === "CREATE_ACCOUNT" ? "CASH" : action.type === "CASH_MOVEMENT" ? action.openingCorrection ? "ADJUSTMENT" : "CONTRIBUTION" : "CATEGORY",
    amount: "", date: today, dueOn: "", occurredAt: action.openingCorrection && action.account?.opening ? new Date(action.account.opening.occurredAt).toISOString().slice(0, 16) : new Date().toISOString().slice(0, 16), reason: "",
    reference: action.expense?.reference ?? "", accountId: action.account?.id ?? action.payment?.accountId ?? "",
    toAccountId: "", counterpartyId: "", hasOpening: true, paid: false, paymentAmount: "",
    lines: [{ label: "", categoryId: "", resourceId: "", amount: "", operational: true }] };
}
function money(value: string, signed = false, zero = false) {
  const negative = signed && value.trim().startsWith("-");
  const parsed = parseGuaranies(negative ? value.trim().slice(1) : value, zero);
  if (parsed === null) throw new Error("Ingresa un importe entero válido en guaraníes, sin decimales.");
  return negative ? -parsed : parsed;
}
function instant(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new Error("Revisa la fecha y hora del registro.");
  const result = new Date(`${value}:00.000Z`);
  if (!Number.isFinite(result.getTime())) throw new Error("Revisa la fecha y hora del registro.");
  return result.toISOString();
}
function accountCommand(action: FinanceAction, draft: CommandDraft): FinanceCommand {
  const opening = { amountMinor: money(draft.amount, true, true), occurredAt: instant(draft.occurredAt), reason: draft.reason.trim() };
  if (action.type === "OPEN_ACCOUNT") return { type: action.type, id: action.account!.id, expectedVersion: action.account!.version, opening };
  return { type: "CREATE_ACCOUNT", name: draft.name.trim(), kind: draft.kind as "CASH" | "BANK", opening: draft.hasOpening ? opening : null };
}
function expenseCommand(action: FinanceAction, draft: CommandDraft): FinanceCommand {
  const settlement = action.type === "SETTLE_EXPENSE" || draft.paid ? { accountId: draft.accountId, amountMinor: money(draft.paymentAmount), occurredAt: instant(draft.occurredAt), reference: draft.reference.trim() || null } : null;
  if (action.type === "SETTLE_EXPENSE") return { type: action.type, id: action.expense!.id, expectedVersion: action.expense!.version, settlement: settlement! };
  return { type: "CREATE_EXPENSE", description: draft.name.trim(), consumedOn: draft.date, dueOn: draft.dueOn || null,
    counterpartyId: draft.counterpartyId || null, reference: draft.reference.trim() || null, amountMinor: money(draft.amount),
    lines: draft.lines.map((line) => ({ label: line.label.trim(), categoryId: line.categoryId, resourceId: line.resourceId || null, amountMinor: money(line.amount), operational: line.operational })),
    settlement };
}
function movementCommand(action: FinanceAction, draft: CommandDraft): FinanceCommand {
  const reason = draft.reason.trim();
  if (action.type === "TRANSFER") return { type: action.type, fromAccountId: draft.accountId, toAccountId: draft.toAccountId, amountMinor: money(draft.amount), occurredAt: instant(draft.occurredAt), reason };
  if (action.type === "CASH_MOVEMENT") return { type: action.type, accountId: draft.accountId, kind: draft.kind as "CONTRIBUTION" | "WITHDRAWAL" | "FINANCING" | "ADJUSTMENT", amountMinor: money(draft.amount, draft.kind === "ADJUSTMENT"), occurredAt: action.openingCorrection ? action.account!.opening!.occurredAt : instant(draft.occurredAt), reason, openingId: action.openingCorrection ? action.account!.opening!.id : null };
  if (action.type === "COUNT_CASH") return { type: action.type, accountId: draft.accountId, occurredAt: instant(draft.occurredAt), countedAmountMinor: money(draft.amount, false, true), reason };
  return { type: "ADJUST_COUNT", id: action.count!.id, expectedVersion: action.count!.version, reason };
}
export function buildCommand(action: FinanceAction, draft: CommandDraft): FinanceCommand {
  const reason = draft.reason.trim();
  if (["CREATE_ACCOUNT", "OPEN_ACCOUNT"].includes(action.type)) {
    // An account without an opening has no known balance and needs no fabricated amount/date.
    if (action.type === "CREATE_ACCOUNT" && !draft.hasOpening) return { type: action.type, kind: draft.kind as "CASH" | "BANK", name: draft.name.trim(), opening: null };
    return accountCommand(action, draft);
  }
  if (["CREATE_EXPENSE", "SETTLE_EXPENSE"].includes(action.type)) {
    return expenseCommand(action, draft);
  }
  if (["TRANSFER", "CASH_MOVEMENT", "COUNT_CASH", "ADJUST_COUNT"].includes(action.type)) return movementCommand(action, draft);
  if (action.type === "CREATE_CATALOG") return { type: action.type, kind: draft.kind as "CATEGORY" | "COUNTERPARTY", name: draft.name.trim() };
  if (action.type === "ARCHIVE_CATALOG") return { type: action.type, id: action.catalog!.id, expectedVersion: action.catalog!.version, reason };
  if (action.type === "ARCHIVE_ACCOUNT") return { type: action.type, id: action.account!.id, expectedVersion: action.account!.version, reason };
  if (action.type === "SET_EVIDENCE") return { type: action.type, id: action.expense!.id, expectedVersion: action.expense!.version, reference: draft.reference.trim() || null, reason };
  if (action.type === "LINK_PAYMENT") return { type: action.type, paymentId: action.payment!.id, accountId: draft.accountId, expectedVersion: action.payment!.version, reason };
  const movement = action.movement!;
  return { type: "REVIEW_MOVEMENT", sourceType: movement.sourceType, sourceId: movement.sourceId, sourceVersion: movement.sourceVersion, expectedVersion: movement.reviewVersion, reviewed: !movement.reviewed || movement.reviewStale, reason };
}
