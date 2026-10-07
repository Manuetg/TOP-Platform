import { FinanceConflictError, FinanceInputError } from '../domain/finance.errors';
import { sumMoney } from '../domain/finance-money';
import type { ExpenseLineInput, FinanceCommand } from '../domain/finance.types';
import { Capability } from '../../../shared/application/authorization-policy';

export function financeCommandCapability(command: FinanceCommand): Capability {
  if (command.type === 'ADJUST_COUNT') return Capability.FINANCE_CASH_ADJUST;
  if (command.type === 'CASH_MOVEMENT' && command.kind === 'ADJUSTMENT') return Capability.FINANCE_CASH_ADJUST;
  return Capability.FINANCE_WRITE;
}

export function requireFinanceVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new FinanceConflictError('La versión cambió. Conserva el borrador y actualiza la fuente.');
}

export function requireFinanceOpening(opening: { occurredAt: Date } | null, occurredAt: Date): void {
  if (!opening) throw new FinanceConflictError('Registra una apertura explícita antes del movimiento.');
  if (occurredAt < opening.occurredAt) throw new FinanceInputError('El movimiento es anterior al corte de apertura.');
}

export function requireExpenseLines(amountMinor: number, lines: ExpenseLineInput[]): void {
  if (sumMoney(lines.map((line) => line.amountMinor)) !== amountMinor) throw new FinanceInputError('Las líneas deben sumar exactamente el importe del documento.');
}

export function requireSettlementAvailable(amountMinor: number, paidMinor: number, settlementMinor: number): void {
  if (sumMoney([paidMinor, settlementMinor]) > amountMinor) throw new FinanceConflictError('La liquidación supera la obligación pendiente.');
}

export function requireDistinctAccounts(from: string, to: string): void {
  if (from === to) throw new FinanceInputError('La transferencia requiere dos cuentas distintas.');
}

export function requireFinanceSourceLimit(count: number, limit: number): void {
  if (count > limit) throw new FinanceConflictError(`La consulta supera ${limit} fuentes. Reduce el período; no se entregan resultados truncados.`);
}

export function requireFinancePaymentCurrency(payments: { currency: string }[]): void {
  if (payments.some((payment) => payment.currency !== 'PYG')) throw new FinanceConflictError('Hay cobros con moneda incompatible. Finance admite únicamente PYG y no convierte importes históricos.');
}
