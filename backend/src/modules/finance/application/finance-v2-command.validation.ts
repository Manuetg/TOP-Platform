import { createHash } from 'node:crypto';
import type { FinanceV2Command, FinanceV2CommandType } from '../domain/finance-v2.types';
import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceUuid } from '../domain/finance-validation';
import { planningDate } from './finance-v2-planning.rules';
import { validateExpenseDefinition } from './finance-v2-draft.handler';
import { validateBudgetDimensions, validatePeriodMonth } from './finance-v2-budget.handler';

type Validator = (value: unknown) => unknown;
type Shape = Record<string, Validator>;
function object(value: unknown, shape: Shape): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) throw new FinanceInputError('Objeto financiero inválido.');
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== Object.keys(shape).length || Object.keys(row).some(key => !(key in shape))) throw new FinanceInputError('El comando contiene campos faltantes o no permitidos.');
  return Object.fromEntries(Object.keys(shape).map(key => [key, shape[key](row[key])]));
}
const text = (max: number): Validator => value => { if (typeof value !== 'string' || !value.trim() || value.length > max) throw new FinanceInputError('Texto financiero inválido.'); return value.trim(); };
const uuid: Validator = value => parseFinanceUuid(value);
const nullable = (validator: Validator): Validator => value => value === null ? null : validator(value);
const integer = (min: number, max = Number.MAX_SAFE_INTEGER): Validator => value => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) throw new FinanceInputError('Entero financiero inválido.'); return value; };
const signed: Validator = value => { integer(-Number.MAX_SAFE_INTEGER)(value); if (value === 0) throw new FinanceInputError('Importe firmado cero no permitido.'); return value; };
const bool: Validator = value => { if (typeof value !== 'boolean') throw new FinanceInputError('Indicador financiero inválido.'); return value; };
const date: Validator = value => { if (typeof value !== 'string') throw new FinanceInputError('Fecha pura inválida.'); planningDate(value); return value; };
const instant: Validator = value => { if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new FinanceInputError('Instante con zona requerido.'); planningDate(value.slice(0,10)); return new Date(value).toISOString(); };
const oneOf = (...values: readonly unknown[]): Validator => value => { if (!values.includes(value)) throw new FinanceInputError('Opción financiera no soportada.'); return value; };
const array = (validator: Validator, min: number, max: number): Validator => value => { if (!Array.isArray(value) || value.length < min || value.length > max) throw new FinanceInputError('Volumen financiero inválido.'); return value.map(validator); };
const record = (shape: Shape): Validator => value => object(value, shape);
const hash: Validator = value => { if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new FinanceInputError('Token financiero inválido.'); return value; };
const csv: Validator = value => { if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > 256 * 1024 || value.length === 0) throw new FinanceInputError('CSV acotado requerido.'); return value; };
const month: Validator = value => { if (typeof value !== 'string') throw new FinanceInputError('Mes inválido.'); validatePeriodMonth(value); return value; };
const line = record({ label: text(120), categoryId: uuid, resourceId: nullable(uuid), bookingId: nullable(uuid), amountMinor: integer(1), operational: bool });
const definition: Validator = value => { const result = object(value, { description: text(500), counterpartyId: nullable(uuid), reference: nullable(text(120)), amountMinor: integer(1), lines: array(line,1,50) }); validateExpenseDefinition(result as unknown as Parameters<typeof validateExpenseDefinition>[0]); return result; };
const settlement = record({ accountId: uuid, amountMinor: integer(1), occurredAt: instant, reference: nullable(text(120)) });
const expense: Validator = value => {
  const row = object(value, { description: text(500), counterpartyId: nullable(uuid), reference: nullable(text(120)), amountMinor: integer(1), lines: array(line,1,50), consumedOn: date, dueOn: nullable(date), settlement: nullable(settlement) });
  validateExpenseDefinition(row as unknown as Parameters<typeof validateExpenseDefinition>[0]); return row;
};
const dimensions: Validator = value => { const lines = array(record({ categoryId: nullable(uuid), resourceId: nullable(uuid), approvedMinor: integer(0) }),1,200)(value); validateBudgetDimensions(lines as Parameters<typeof validateBudgetDimensions>[0]); return lines; };
const ruleParts = array(record({ resourceId: uuid, basisPoints: integer(0,10000) }),0,200);
const component: Validator = value => {
  const row = object(value, { sourceType: oneOf('PAYMENT','REFUND','SETTLEMENT','MOVEMENT','TRANSFER'), sourceId: uuid, sourceLeg: nullable(oneOf('FROM','TO')), sourceVersion: integer(1), sourceHash: hash, amountMinor: signed });
  if ((row.sourceType === 'TRANSFER') !== (row.sourceLeg !== null)) throw new FinanceInputError('Pata de transferencia inválida.'); return row;
};
const fee: Validator = value => {
  if (!value || typeof value !== 'object') throw new FinanceInputError('Comisión inválida.');
  return 'existingExpenseId' in value ? object(value,{ bankRowId: uuid, existingExpenseId: uuid, existingSettlementId: uuid }) : object(value,{ bankRowId: uuid, expenseDefinition: definition, consumedOn: date, occurredAt: instant, reference: nullable(text(120)) });
};
const reason = text(500); const version = integer(0); const idVersion = { id: uuid, expectedVersion: version };
const draftInput = { expenseDefinition: definition, consumedOn: date, dueOn: nullable(date) };
const shapes: Record<FinanceV2CommandType, Shape> = {
  CONFIRM_HISTORY_IMPORT: { sourceNamespace: text(64), csv, previewToken: hash, reason },
  CONFIRM_BANK_STATEMENT: { accountId: uuid, expectedAccountVersion: version, sourceNamespace: text(64), csv, previewToken: hash, reason },
  CREATE_EXPENSE_TEMPLATE: { name: text(120), expenseDefinition: definition },
  REVISE_EXPENSE_TEMPLATE: { ...idVersion, expenseDefinition: definition, reason },
  GENERATE_RECURRING_DRAFT: { templateId: uuid, expectedTemplateVersion: version, periodMonth: month, consumedOn: date, dueOn: nullable(date) },
  CREATE_EXPENSE_DRAFT: draftInput,
  EDIT_EXPENSE_DRAFT: { ...idVersion, ...draftInput, reason },
  SUBMIT_EXPENSE_DRAFT: { ...idVersion, expectedPolicyVersion: version, reason },
  WITHDRAW_EXPENSE_DRAFT: { ...idVersion, reason },
  DECIDE_EXPENSE_DRAFT: { ...idVersion, policyRevisionId: uuid, decision: oneOf('APPROVE','REJECT'), reason },
  CONFIRM_EXPENSE_DRAFT: { ...idVersion, settlement: nullable(settlement), reason },
  SET_EXPENSE_APPROVAL_POLICY: { expectedPolicyVersion: version, enabled: bool, scope: oneOf('ALL_NEW_EXPENSE_CONFIRMATIONS'), requireDifferentActor: oneOf(true), reason },
  CREATE_REIMBURSEMENT_DRAFT: { ...draftInput, creditorCounterpartyId: uuid, supplierCounterpartyId: nullable(uuid), externallyPaidOn: date, privateReference: nullable(text(120)) },
  REIMBURSE_EXPENSE: { expenseId: uuid, expectedVersion: version, settlement, reason },
  CONFIRM_BANK_MATCH: { accountId: uuid, rows: array(record({ id: uuid, version: integer(1), amountMinor: signed }),1,100), components: array(component,0,200), paymentLinks: array(record({ paymentId: uuid, expectedLinkVersion: version, accountId: uuid, reason }),0,200), fees: array(fee,0,100), previewToken: hash, reason },
  CANCEL_BANK_MATCH: { ...idVersion, reason },
  CREATE_ALLOCATION_RULE: { name: text(120), validFrom: date, validTo: nullable(date), parts: ruleParts },
  REVISE_ALLOCATION_RULE: { ...idVersion, validFrom: date, validTo: nullable(date), parts: ruleParts, reason },
  APPLY_COST_ALLOCATION: { source: record({ kind: oneOf('EXPENSE_LINE','LABOR_ESTIMATE','OWNER_IMPUTED'), id: uuid }), expectedSourceVersion: integer(1), ruleId: uuid, ruleVersion: integer(1), expectedAllocationVersion: version, reason },
  CREATE_LABOR_COST: { label: text(120), personLabel: nullable(text(120)), periodMonth: month, consumedOn: date, kind: oneOf('PRECOMPUTED_LABOR','OWNER_IMPUTED'), actualExpenseLineId: nullable(uuid), estimatedMinor: nullable(integer(0)), reason },
  REVISE_LABOR_COST: { ...idVersion, actualExpenseLineId: nullable(uuid), estimatedMinor: nullable(integer(0)), reason },
  CREATE_BUDGET_REVISION: { periodMonth: month, expectedBudgetVersion: version, lines: dimensions, reason },
  APPROVE_BUDGET_REVISION: { id: uuid, expectedBudgetVersion: version, reason },
  CREATE_COMMITMENT: { description: text(500), amountMinor: integer(1), categoryId: nullable(uuid), resourceId: nullable(uuid), expectedConsumptionOn: date, dueOn: nullable(date), operational: bool, reference: nullable(text(120)), reason },
  CANCEL_COMMITMENT: { ...idVersion, reason },
  CONVERT_COMMITMENT: { ...idVersion, expenseDraftId: nullable(uuid), expectedDraftVersion: nullable(version), expense: nullable(expense), reason },
};
export function parseFinanceV2Command(value: unknown): FinanceV2Command {
  if (!value || typeof value !== 'object' || !('type' in value) || typeof value.type !== 'string' || !Object.prototype.hasOwnProperty.call(shapes,value.type)) throw new FinanceInputError('Comando Finance V2 no permitido.');
  const type = value.type as FinanceV2CommandType;
  const command = object(value, { type: oneOf(type), ...shapes[type] }) as unknown as FinanceV2Command;
  if (command.type === 'CONVERT_COMMITMENT') requireConversionShape(command);
  return command;
}
function requireConversionShape(command: Extract<FinanceV2Command,{type:'CONVERT_COMMITMENT'}>): void {
  const direct = command.expenseDraftId === null && command.expectedDraftVersion === null && command.expense !== null;
  const drafted = command.expenseDraftId !== null && command.expectedDraftVersion !== null && command.expense === null;
  if (!direct && !drafted) throw new FinanceInputError('Conversión requiere exactamente borrador aprobado o gasto directo.');
}
export function financeV2Fingerprint(command: FinanceV2Command): string { return createHash('sha256').update(JSON.stringify(command)).digest('hex'); }
