import type { FinanceBudgetForecastBasis, FinanceV2PageQuery, FinanceV2ReportQuery, FinanceHistoryPreviewInput, FinanceBankStatementPreviewInput, FinanceBankMatchPreviewInput, FinanceCashProjectionInput } from '../domain/finance-v2.types';
import { FinanceInputError } from '../domain/finance.errors';
import { parseFinanceUuid } from '../domain/finance-validation';
import { parseFinanceV2Command } from '../application/finance-v2-command.validation';
import { validatePeriodMonth } from '../application/finance-v2-budget.handler';
import { planningDate } from '../application/finance-v2-planning.rules';
import { evidenceInstant } from '../application/finance-v2-evidence.validation';

function shape(value: unknown, required: readonly string[], optional: readonly string[] = [], query = false): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FinanceInputError('Objeto Finance V2 inválido.');
  const prototype: unknown = Object.getPrototypeOf(value);
  validatePrototype(prototype, query);
  const row = value as Record<string, unknown>;
  if (Reflect.ownKeys(row).some(key => typeof key !== 'string' || ![...required, ...optional].includes(key)) || required.some(key => !Object.prototype.hasOwnProperty.call(row, key))) throw new FinanceInputError('Campos financieros faltantes o no permitidos.');
  return row;
}

function validatePrototype(prototype: unknown, query: boolean): void {
  if (prototype !== Object.prototype && !(query && prototype === null)) throw new FinanceInputError('Objeto Finance V2 inválido.');
}

function text(value: unknown, maximum: number): string {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || Array.from(value).some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new FinanceInputError('Texto financiero inválido.');
  return value.trim();
}

function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new FinanceInputError('Entero financiero inválido.');
  return value;
}

function date(value: unknown): string {
  if (typeof value !== 'string') throw new FinanceInputError('Fecha pura requerida.');
  planningDate(value); return value;
}

export function parseFinanceV2AsOf(value: unknown, serverNow = new Date()): string {
  if (value === undefined) return serverNow.toISOString();
  if (typeof value !== 'string') throw new FinanceInputError('Corte ISO con zona requerido.');
  return evidenceInstant(value, 'asOf');
}

export function parseFinanceV2PageQuery(value: unknown): FinanceV2PageQuery {
  return parseFinanceV2BankPageQuery(value);
}

/** Las colecciones nuevas comparten orden y cursor UUID; el cliente conserva el cursor opaco. */
export function parseFinanceV2BankPageQuery(value: unknown): FinanceV2PageQuery {
  const row = shape(value, [], ['cursor', 'limit'], true);
  const limit = row.limit === undefined ? 50 : typeof row.limit === 'string' && /^[1-9]\d{0,2}$/.test(row.limit) ? Number(row.limit) : NaN;
  integer(limit, 1, 100);
  return { limit, cursor: row.cursor === undefined ? null : parseFinanceUuid(row.cursor) };
}

export function parseFinanceV2ReportQuery(value: unknown, serverNow = new Date()): FinanceV2ReportQuery {
  const row = shape(value, ['from', 'to'], ['asOf', 'sourceToken'], true);
  const from = date(row.from); const to = date(row.to);
  const length = planningDate(to) - planningDate(from);
  if (length < 1 || length > 366) throw new FinanceInputError('El período admite de 1 a 366 días.');
  const result: FinanceV2ReportQuery = { from, to, asOf: parseFinanceV2AsOf(row.asOf, serverNow) };
  if (row.sourceToken !== undefined) result.sourceToken = hash(row.sourceToken, false);
  return result;
}

export function parseFinanceV2Month(value: unknown): string {
  const row = shape(value, ['periodMonth'], [], true);
  const month = text(row.periodMonth, 7); validatePeriodMonth(month); return month;
}

export function parseFinanceV2BudgetComparisonQuery(value: unknown): { periodMonth: string; forecastBasis: FinanceBudgetForecastBasis | null } {
  const row = shape(value, ['periodMonth'], ['forecastBasis'], true);
  const periodMonth = text(row.periodMonth, 7); validatePeriodMonth(periodMonth);
  if (row.forecastBasis !== undefined && row.forecastBasis !== 'ACTUAL_PLUS_PENDING_COMMITMENTS') throw new FinanceInputError('Base de previsión de costos inválida.');
  return { periodMonth, forecastBasis: row.forecastBasis === undefined ? null : 'ACTUAL_PLUS_PENDING_COMMITMENTS' };
}
export function parseFinanceV2AccountQuery(value: unknown): string { return parseFinanceUuid(shape(value, ['accountId'], [], true).accountId); }
export function parseFinanceV2AgingQuery(value: unknown, serverNow = new Date()): string { return parseFinanceV2AsOf(shape(value, [], ['asOf'], true).asOf, serverNow); }

const previewToken = '0'.repeat(64);

export function parseFinanceHistoryPreview(value: unknown): FinanceHistoryPreviewInput {
  const row = shape(value, ['sourceNamespace', 'csv']);
  const command = parseFinanceV2Command({ ...row, type: 'CONFIRM_HISTORY_IMPORT', previewToken, reason: 'Vista previa' });
  if (command.type !== 'CONFIRM_HISTORY_IMPORT') throw new Error('FINANCE_PREVIEW_PARSER_INVARIANT');
  return { sourceNamespace: command.sourceNamespace, csv: command.csv };
}

export function parseFinanceBankStatementPreview(value: unknown): FinanceBankStatementPreviewInput {
  const row = shape(value, ['accountId', 'expectedAccountVersion', 'sourceNamespace', 'csv']);
  const command = parseFinanceV2Command({ ...row, type: 'CONFIRM_BANK_STATEMENT', previewToken, reason: 'Vista previa' });
  if (command.type !== 'CONFIRM_BANK_STATEMENT') throw new Error('FINANCE_PREVIEW_PARSER_INVARIANT');
  return { accountId: command.accountId, expectedAccountVersion: command.expectedAccountVersion, sourceNamespace: command.sourceNamespace, csv: command.csv };
}

export function parseFinanceBankMatchPreview(value: unknown): FinanceBankMatchPreviewInput {
  const row = shape(value, ['accountId', 'rows', 'components', 'paymentLinks', 'fees', 'reason']);
  const command = parseFinanceV2Command({ ...row, type: 'CONFIRM_BANK_MATCH', previewToken });
  if (command.type !== 'CONFIRM_BANK_MATCH') throw new Error('FINANCE_PREVIEW_PARSER_INVARIANT');
  return { accountId: command.accountId, rows: command.rows, components: command.components, paymentLinks: command.paymentLinks, fees: command.fees, reason: command.reason };
}

function hash(value: unknown, empty: boolean): string {
  if (empty && value === '') return '';
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) throw new FinanceInputError('Token financiero inválido.');
  return value;
}

function array(value: unknown, maximum: number): unknown[] {
  if (!Array.isArray(value) || value.length > maximum) throw new FinanceInputError('Lista financiera fuera de límite.');
  return value as unknown[];
}

function projectionEvent(value: unknown): FinanceCashProjectionInput['events'][number] {
  const row = shape(value, ['sourceKey', 'direction', 'amountMinor', 'expectedOn', 'probabilityBasisPoints', 'accountId', 'reason']);
  if (row.direction !== 'IN' && row.direction !== 'OUT') throw new FinanceInputError('Dirección de escenario inválida.');
  return { sourceKey: row.sourceKey === null ? null : text(row.sourceKey, 160), direction: row.direction, amountMinor: integer(row.amountMinor, 1), expectedOn: date(row.expectedOn), probabilityBasisPoints: integer(row.probabilityBasisPoints, 0, 10000), accountId: row.accountId === null ? null : parseFinanceUuid(row.accountId), reason: text(row.reason, 500) };
}

export function parseFinancePlanningPreview(value: unknown): FinanceCashProjectionInput {
  const row = shape(value, ['asOf', 'horizonTo', 'baseToken', 'accountIds', 'events', 'excludedSourceKeys']);
  const accountIds = array(row.accountIds, 100).map(parseFinanceUuid);
  if (accountIds.length === 0 || new Set(accountIds).size !== accountIds.length) throw new FinanceInputError('Selecciona cuentas sin repetición.');
  const excludedSourceKeys = array(row.excludedSourceKeys, 5000).map(value => text(value, 160));
  if (new Set(excludedSourceKeys).size !== excludedSourceKeys.length) throw new FinanceInputError('Las exclusiones no pueden repetirse.');
  return { asOf: parseFinanceV2AsOf(row.asOf), horizonTo: date(row.horizonTo), baseToken: hash(row.baseToken, true), accountIds, events: array(row.events, 200).map(projectionEvent), excludedSourceKeys };
}
