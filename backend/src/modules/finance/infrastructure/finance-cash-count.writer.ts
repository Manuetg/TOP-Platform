import type { FinanceCommand, FinanceMutation, FinanceResult } from '../domain/finance.types';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { requireFinanceOpening, requireFinanceVersion } from '../application/finance-command-rules';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { findFinanceAccount, type FinanceTransaction } from './finance-prisma-context';
import { registeredFinanceBalance } from './finance-account-balance';

type CountCommand = Extract<FinanceCommand, { type: 'COUNT_CASH' | 'ADJUST_COUNT' }>;

export async function writeFinanceCashCount(tx: FinanceTransaction, input: FinanceMutation, command: CountCommand): Promise<FinanceResult> {
  if (command.type === 'ADJUST_COUNT') return adjustCount(tx, input, command);
  const account = await findFinanceAccount(tx, input.businessId, command.accountId);
  if (account.kind !== 'CASH') throw new FinanceInputError('El arqueo requiere una cuenta de efectivo.');
  const cut = new Date(command.occurredAt);
  requireFinanceOpening(account.opening, cut);
  const opening = account.opening!;
  const expected = await registeredFinanceBalance(tx, input.businessId, account.id, opening, cut);
  const difference = sumMoney([command.countedAmountMinor, -expected]);
  const row = await tx.financeCashCount.create({ data: { businessId: input.businessId, accountId: account.id, occurredAt: cut, expectedAmountMinor: BigInt(expected), countedAmountMinor: BigInt(command.countedAmountMinor), differenceMinor: BigInt(difference), reason: command.reason, recordedByUserId: input.actorUserId } });
  return { id: row.id, version: row.version, type: command.type };
}

async function adjustCount(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'ADJUST_COUNT' }>): Promise<FinanceResult> {
  const count = await tx.financeCashCount.findFirst({ where: { businessId: input.businessId, id: command.id } });
  if (!count) throw new FinanceNotFoundError('Arqueo no disponible.');
  requireFinanceVersion(count.version, command.expectedVersion);
  if (count.adjustmentId) throw new FinanceConflictError('El arqueo ya tiene un ajuste registrado.');
  const adjustedCut = await tx.financeCashCount.findFirst({ where: { businessId: input.businessId, accountId: count.accountId, occurredAt: count.occurredAt, id: { not: count.id }, adjustmentId: { not: null } }, select: { id: true } });
  if (adjustedCut) throw new FinanceConflictError('Este corte ya tiene un ajuste; registra nuevo arqueo con corte posterior.');
  const difference = safeMoney(count.differenceMinor);
  if (difference === 0) throw new FinanceConflictError('El arqueo no tiene diferencia para ajustar.');
  const account = await findFinanceAccount(tx, input.businessId, count.accountId);
  requireFinanceOpening(account.opening, count.occurredAt);
  const expected = await registeredFinanceBalance(tx, input.businessId, account.id, account.opening!, count.occurredAt);
  if (expected !== safeMoney(count.expectedAmountMinor)) throw new FinanceConflictError('El saldo al corte cambió. Registra un nuevo arqueo.');
  const movement = await tx.financeCashMovement.create({ data: { businessId: input.businessId, accountId: account.id, kind: 'ADJUSTMENT', amountMinor: BigInt(difference), occurredAt: count.occurredAt, reason: command.reason, recordedByUserId: input.actorUserId } });
  const updated = await tx.financeCashCount.update({ where: { id: count.id }, data: { adjustmentId: movement.id, version: { increment: 1 } } });
  return { id: updated.id, version: updated.version, type: command.type };
}
