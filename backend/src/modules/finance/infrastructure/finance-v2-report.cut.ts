import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { planningDate } from '../application/finance-v2-planning.rules';

export class FinanceCostSourceStaleError extends FinanceConflictError {
  readonly code = 'SOURCE_STALE';

  constructor() {
    super('SOURCE_STALE: el costo cambió después del corte solicitado; actualiza el corte antes de continuar.');
  }
}

/** Normalize explicit offsets before comparing PostgreSQL UTC timestamp columns. */
export function financeReportCut(value: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new FinanceInputError('El corte debe ser ISO con offset explícito.');
  planningDate(match[1]);
  validateClock(match[2], match[3], match[4]);
  validateOffset(match[5]);
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new FinanceInputError('El corte ISO no es válido.');
  const normalized = date.toISOString();
  if (!/^\d{4}-/.test(normalized) || normalized.startsWith('0000-')) throw new FinanceInputError('El corte queda fuera de los años admitidos.');
  return normalized;
}

function validateClock(hour: string, minute: string, second: string): void {
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new FinanceInputError('La hora del corte no es válida.');
}

function validateOffset(offset: string): void {
  if (offset === 'Z') return;
  const hours = Number(offset.slice(1, 3));
  const minutes = Number(offset.slice(4, 6));
  if (hours > 14 || minutes > 59 || (hours === 14 && minutes !== 0)) throw new FinanceInputError('El offset del corte no es válido.');
}
