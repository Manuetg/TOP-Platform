import { FinanceInputError } from './finance.errors';
import { sumMoney } from './finance-money';
import type { ExpenseLineInput, FinanceCommand, FinanceQuery, OpeningInput, SettlementInput } from './finance.types';

type Input = Record<string, unknown>;
type CommandType = FinanceCommand['type'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 86_400_000;

function object(value: unknown): Input {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new FinanceInputError('Se requiere un objeto financiero.');
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new FinanceInputError('Se requiere un objeto financiero simple.');
  }
  return value as Input;
}

function strict(value: unknown, fields: readonly string[]): Input {
  const result = object(value);
  if (Reflect.ownKeys(result).some(key => typeof key !== 'string' || !fields.includes(key))) {
    throw new FinanceInputError('El comando contiene campos no admitidos.');
  }
  return result;
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string') throw new FinanceInputError(`${field} debe ser texto.`);
  const result = value.trim();
  if (!result || result.length > max || containsControl(result)) {
    throw new FinanceInputError(`${field} debe contener entre 1 y ${max} caracteres sin controles.`);
  }
  return result;
}

function containsControl(value: string): boolean {
  return Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function reference(value: unknown): string | null {
  // Una referencia es texto privado; no constituye un archivo ni una URL pública.
  return value === undefined || value === null ? null : text(value, 'reference', 500);
}

function uuid(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new FinanceInputError('Se requiere un UUID válido.');
  return value.toLowerCase();
}

export function parseFinanceUuid(value: unknown): string {
  return uuid(value);
}

function nullableUuid(value: unknown): string | null {
  return value === undefined || value === null ? null : uuid(value);
}

function integer(value: unknown, minimum: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) {
    throw new FinanceInputError(`Se requiere un entero seguro mayor o igual a ${minimum}.`);
  }
  return value;
}

function signedMoney(value: unknown, zeroAllowed: boolean): number {
  const result = integer(value, -Number.MAX_SAFE_INTEGER);
  if (!zeroAllowed && result === 0) throw new FinanceInputError('El ajuste debe tener un importe distinto de cero.');
  return result;
}

function choice<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new FinanceInputError('El valor no pertenece al catálogo financiero admitido.');
  }
  return value as T;
}

function boolean(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new FinanceInputError('Se requiere un booleano explícito.');
  return value;
}

function date(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000-')) {
    throw new FinanceInputError('La fecha debe tener formato YYYY-MM-DD y año válido.');
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new FinanceInputError('La fecha no existe en el calendario.');
  }
  return value;
}

function nullableDate(value: unknown): string | null {
  return value === undefined || value === null ? null : date(value);
}

function instant(value: unknown): string {
  if (typeof value !== 'string') throw new FinanceInputError('El instante debe ser ISO con offset explícito.');
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new FinanceInputError('El instante debe ser ISO con offset explícito y precisión de milisegundos.');
  date(match[1]);
  validateClock(match[2], match[3], match[4]);
  validateOffset(match[5]);
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new FinanceInputError('El instante ISO no es válido.');
  const normalized = parsed.toISOString();
  if (!/^\d{4}-/.test(normalized) || normalized.startsWith('0000-')) {
    throw new FinanceInputError('El instante normalizado queda fuera de los años admitidos.');
  }
  return normalized;
}

function validateClock(hour: string, minute: string, second: string): void {
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new FinanceInputError('La hora ISO no es válida.');
  }
}

function validateOffset(offset: string): void {
  if (offset === 'Z') return;
  if (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4, 6)) > 59) {
    throw new FinanceInputError('El offset ISO no es válido.');
  }
}

function opening(value: unknown): OpeningInput {
  const input = strict(value, ['amountMinor', 'occurredAt', 'reason']);
  return { amountMinor: signedMoney(input.amountMinor, true), occurredAt: instant(input.occurredAt), reason: text(input.reason, 'reason', 500) };
}

function settlement(value: unknown): SettlementInput {
  const input = strict(value, ['accountId', 'amountMinor', 'occurredAt', 'reference']);
  return { accountId: uuid(input.accountId), amountMinor: integer(input.amountMinor, 1), occurredAt: instant(input.occurredAt), reference: reference(input.reference) };
}

function line(value: unknown): ExpenseLineInput {
  const input = strict(value, ['label', 'categoryId', 'resourceId', 'amountMinor', 'operational']);
  return { label: text(input.label, 'label', 120), categoryId: uuid(input.categoryId), resourceId: nullableUuid(input.resourceId), amountMinor: integer(input.amountMinor, 1), operational: boolean(input.operational) };
}

function expense(input: Input): FinanceCommand {
  if (!Array.isArray(input.lines) || input.lines.length < 1 || input.lines.length > 50) {
    throw new FinanceInputError('Un gasto requiere entre 1 y 50 líneas.');
  }
  const lines = input.lines.map(line);
  const amountMinor = integer(input.amountMinor, 1);
  if (sumMoney(lines.map(item => item.amountMinor)) !== amountMinor) {
    throw new FinanceInputError('La suma de las líneas debe coincidir exactamente con el total.');
  }
  const paid = input.settlement === undefined || input.settlement === null ? null : settlement(input.settlement);
  if (paid && paid.amountMinor > amountMinor) throw new FinanceInputError('El pago no puede superar el gasto.');
  return { type: 'CREATE_EXPENSE', description: text(input.description, 'description', 240), consumedOn: date(input.consumedOn), dueOn: nullableDate(input.dueOn), counterpartyId: nullableUuid(input.counterpartyId), reference: reference(input.reference), amountMinor, lines, settlement: paid };
}

function transfer(input: Input): FinanceCommand {
  const fromAccountId = uuid(input.fromAccountId);
  const toAccountId = uuid(input.toAccountId);
  if (fromAccountId === toAccountId) throw new FinanceInputError('Una transferencia requiere cuentas distintas.');
  return { type: 'TRANSFER', fromAccountId, toAccountId, amountMinor: integer(input.amountMinor, 1), occurredAt: instant(input.occurredAt), reason: text(input.reason, 'reason', 500) };
}

function movement(input: Input): FinanceCommand {
  const kind = choice(input.kind, ['CONTRIBUTION', 'WITHDRAWAL', 'FINANCING', 'ADJUSTMENT'] as const);
  const amountMinor = kind === 'ADJUSTMENT' ? signedMoney(input.amountMinor, false) : integer(input.amountMinor, 1);
  const openingId = nullableUuid(input.openingId);
  if (openingId && kind !== 'ADJUSTMENT') throw new FinanceInputError('Solo un ajuste puede referenciar una apertura.');
  return { type: 'CASH_MOVEMENT', accountId: uuid(input.accountId), kind, amountMinor, occurredAt: instant(input.occurredAt), reason: text(input.reason, 'reason', 500), openingId };
}

const FIELDS: Record<CommandType, readonly string[]> = {
  CREATE_CATALOG: ['kind', 'name'], ARCHIVE_CATALOG: ['id', 'expectedVersion', 'reason'],
  CREATE_ACCOUNT: ['kind', 'name', 'opening'], ARCHIVE_ACCOUNT: ['id', 'expectedVersion', 'reason'],
  OPEN_ACCOUNT: ['id', 'expectedVersion', 'opening'],
  CREATE_EXPENSE: ['description', 'consumedOn', 'dueOn', 'counterpartyId', 'reference', 'amountMinor', 'lines', 'settlement'],
  SETTLE_EXPENSE: ['id', 'expectedVersion', 'settlement'], SET_EVIDENCE: ['id', 'expectedVersion', 'reference', 'reason'],
  LINK_PAYMENT: ['paymentId', 'accountId', 'expectedVersion', 'reason'],
  TRANSFER: ['fromAccountId', 'toAccountId', 'amountMinor', 'occurredAt', 'reason'],
  CASH_MOVEMENT: ['accountId', 'kind', 'amountMinor', 'occurredAt', 'reason', 'openingId'],
  REVIEW_MOVEMENT: ['sourceType', 'sourceId', 'sourceVersion', 'expectedVersion', 'reviewed', 'reason'],
  COUNT_CASH: ['accountId', 'occurredAt', 'countedAmountMinor', 'reason'], ADJUST_COUNT: ['id', 'expectedVersion', 'reason'],
};

const PARSERS: Record<CommandType, (input: Input) => FinanceCommand> = {
  CREATE_CATALOG: input => ({ type: 'CREATE_CATALOG', kind: choice(input.kind, ['CATEGORY', 'COUNTERPARTY'] as const), name: text(input.name, 'name', 80) }),
  ARCHIVE_CATALOG: input => ({ type: 'ARCHIVE_CATALOG', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), reason: text(input.reason, 'reason', 500) }),
  CREATE_ACCOUNT: input => ({ type: 'CREATE_ACCOUNT', kind: choice(input.kind, ['CASH', 'BANK'] as const), name: text(input.name, 'name', 80), opening: input.opening === undefined || input.opening === null ? null : opening(input.opening) }),
  ARCHIVE_ACCOUNT: input => ({ type: 'ARCHIVE_ACCOUNT', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), reason: text(input.reason, 'reason', 500) }),
  OPEN_ACCOUNT: input => ({ type: 'OPEN_ACCOUNT', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), opening: opening(input.opening) }),
  CREATE_EXPENSE: expense,
  SETTLE_EXPENSE: input => ({ type: 'SETTLE_EXPENSE', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), settlement: settlement(input.settlement) }),
  SET_EVIDENCE: input => ({ type: 'SET_EVIDENCE', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), reference: reference(input.reference), reason: text(input.reason, 'reason', 500) }),
  LINK_PAYMENT: input => ({ type: 'LINK_PAYMENT', paymentId: uuid(input.paymentId), accountId: uuid(input.accountId), expectedVersion: integer(input.expectedVersion, 0), reason: text(input.reason, 'reason', 500) }),
  TRANSFER: transfer,
  CASH_MOVEMENT: movement,
  REVIEW_MOVEMENT: input => ({ type: 'REVIEW_MOVEMENT', sourceType: choice(input.sourceType, ['OPENING', 'SETTLEMENT', 'PAYMENT', 'VOID', 'REFUND', 'TRANSFER', 'MOVEMENT'] as const), sourceId: uuid(input.sourceId), sourceVersion: integer(input.sourceVersion, 1), expectedVersion: integer(input.expectedVersion, 0), reviewed: boolean(input.reviewed), reason: text(input.reason, 'reason', 500) }),
  COUNT_CASH: input => ({ type: 'COUNT_CASH', accountId: uuid(input.accountId), occurredAt: instant(input.occurredAt), countedAmountMinor: integer(input.countedAmountMinor, 0), reason: text(input.reason, 'reason', 500) }),
  ADJUST_COUNT: input => ({ type: 'ADJUST_COUNT', id: uuid(input.id), expectedVersion: integer(input.expectedVersion, 1), reason: text(input.reason, 'reason', 500) }),
};

export function parseFinanceCommand(input: unknown): FinanceCommand {
  const type = object(input).type;
  if (typeof type !== 'string' || !Object.hasOwn(FIELDS, type)) throw new FinanceInputError('El tipo de comando financiero no es válido.');
  const commandType = type as CommandType;
  return PARSERS[commandType](strict(input, ['type', ...FIELDS[commandType]]));
}

export function parseFinanceQuery(from: unknown, to: unknown): FinanceQuery {
  const result = { from: date(from), to: date(to) };
  const days = (Date.parse(`${result.to}T00:00:00Z`) - Date.parse(`${result.from}T00:00:00Z`)) / DAY_MS;
  if (days < 1 || days > 366) throw new FinanceInputError('El período [from, to) debe abarcar de 1 a 366 días.');
  return result;
}

export function parseFinanceIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{16,128}$/.test(value)) {
    throw new FinanceInputError('Idempotency-Key requiere de 16 a 128 caracteres alfanuméricos, punto, guion o guion bajo.');
  }
  return value;
}
