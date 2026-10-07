import type { FinanceCommand, FinanceMutation, FinanceResult } from '../domain/finance.types';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { requireDistinctAccounts, requireFinanceOpening, requireFinanceVersion } from '../application/finance-command-rules';
import { findFinanceAccount, financeJson, type FinanceTransaction } from './finance-prisma-context';
import { readFinancePaymentCashSources, financePaymentCashState } from './finance-payment-cash.sources';

type MoneyCommand = Extract<FinanceCommand, { type: 'LINK_PAYMENT' | 'TRANSFER' | 'CASH_MOVEMENT' }>;

export async function writeFinanceMoney(tx: FinanceTransaction, input: FinanceMutation, command: MoneyCommand): Promise<FinanceResult> {
  if (command.type === 'LINK_PAYMENT') return linkPayment(tx, input, command);
  if (command.type === 'TRANSFER') return transfer(tx, input, command);
  const account = await findFinanceAccount(tx, input.businessId, command.accountId);
  requireFinanceOpening(account.opening, new Date(command.occurredAt));
  if (command.openingId && (command.kind !== 'ADJUSTMENT' || account.opening?.id !== command.openingId)) throw new FinanceNotFoundError('Apertura no disponible para este ajuste.');
  const amount = command.kind === 'WITHDRAWAL' ? -command.amountMinor : command.amountMinor;
  const row = await tx.financeCashMovement.create({ data: { businessId: input.businessId, accountId: account.id, kind: command.kind, amountMinor: BigInt(amount), occurredAt: new Date(command.occurredAt), reason: command.reason, openingId: command.openingId, recordedByUserId: input.actorUserId } });
  return { id: row.id, version: 1, type: command.type };
}

async function transfer(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'TRANSFER' }>): Promise<FinanceResult> {
  requireDistinctAccounts(command.fromAccountId, command.toAccountId);
  const accounts = await Promise.all([command.fromAccountId, command.toAccountId].sort().map((id) => findFinanceAccount(tx, input.businessId, id)));
  for (const account of accounts) requireFinanceOpening(account.opening, new Date(command.occurredAt));
  const row = await tx.financeTransfer.create({ data: { businessId: input.businessId, fromAccountId: command.fromAccountId, toAccountId: command.toAccountId, amountMinor: BigInt(command.amountMinor), occurredAt: new Date(command.occurredAt), reason: command.reason, recordedByUserId: input.actorUserId } });
  return { id: row.id, version: 1, type: command.type };
}

async function linkPayment(tx: FinanceTransaction, input: FinanceMutation, command: Extract<FinanceCommand, { type: 'LINK_PAYMENT' }>): Promise<FinanceResult> {
  const payment = await findLinkablePayment(tx, input.businessId, command.paymentId);
  const account = await findFinanceAccount(tx, input.businessId, command.accountId);
  if (!account.opening) throw new FinanceConflictError('Registra una apertura antes de asignar cobros.');
  const link = await tx.financePaymentLink.findFirst({ where: { businessId: input.businessId, paymentId: payment.id } });
  requireFinanceVersion(link?.version ?? 0, command.expectedVersion);
  if (link?.accountId === account.id) return { id: link.id, version: link.version, type: command.type };
  if (!link) {
    const created = await tx.financePaymentLink.create({ data: { businessId: input.businessId, paymentId: payment.id, accountId: account.id, recordedByUserId: input.actorUserId } });
    return { id: created.id, version: created.version, type: command.type };
  }
  await tx.financeAudit.create({ data: { businessId: input.businessId, action: 'PAYMENT_ACCOUNT_DIFFERENTIAL', sourceId: payment.id, actorUserId: input.actorUserId, details: financeJson({ beforeAccountId: link.accountId, afterAccountId: account.id, beforeVersion: link.version, afterVersion: link.version + 1, reason: command.reason }) } });
  const updated = await tx.financePaymentLink.update({ where: { id: link.id }, data: { accountId: account.id, version: { increment: 1 }, recordedByUserId: input.actorUserId } });
  return { id: updated.id, version: updated.version, type: command.type };
}

async function findLinkablePayment(tx: FinanceTransaction, businessId: string, paymentId: string) {
  const { payments, paymentAdjustments } = await readFinancePaymentCashSources(tx, businessId);
  if (payments.length > 5000) throw new FinanceConflictError('Demasiados cobros para esta operación.');
  const payment = payments.find((row) => row.id === paymentId);
  if (!payment) throw new FinanceNotFoundError('Cobro no disponible.');
  if (payment.currency !== 'PYG') throw new FinanceConflictError('El cobro registrado no está en PYG; Finance no convierte su historial.');
  if (financePaymentCashState(payment, paymentAdjustments).effectiveStatus === 'VOIDED') throw new FinanceConflictError('El cobro está anulado; se conserva su vínculo histórico y no se crea otra asignación.');
  return payment;
}
