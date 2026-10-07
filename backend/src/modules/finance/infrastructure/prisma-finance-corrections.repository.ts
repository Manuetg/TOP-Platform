import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { appendPaymentAdjustment } from '../../payment/payment.contract';
import { appendTerminalFinalAmount } from '../../pricing/pricing.contract';
import { Capability } from '../../../shared/application/authorization-policy';
import { FinanceConflictError } from '../domain/finance.errors';
import type { FinanceActor } from '../domain/finance.types';
import type { FinanceCorrectionsData } from '../domain/finance-corrections.types';
import type { FinanceCorrectionCommand, FinanceCorrectionMutation, FinanceCorrectionResult, FinanceCorrectionsRepository } from '../application/finance-corrections.port';
import { authorizeFinance, authorizeFinanceMembership, financeJson } from './finance-prisma-context';
import { resolveFinanceRefundAccount } from './finance-refund-account.resolver';
import { readFinanceCorrections } from './prisma-finance-corrections.reader';

function correctionCapability(command: FinanceCorrectionCommand): Capability {
  if (command.type === 'SET_TERMINAL_FINAL_AMOUNT') return Capability.PRICING_FINAL_AMOUNT;
  return command.type === 'VOID_PAYMENT' ? Capability.PAYMENT_VOID : Capability.PAYMENT_REFUND;
}

export const FINANCE_CORRECTIONS_ACCUMULATION_GUARD = Symbol('FINANCE_CORRECTIONS_ACCUMULATION_GUARD');
export type FinanceCorrectionAccumulationGuard = (transaction: Prisma.TransactionClient, businessId: string) => Promise<void>;

export async function executeFinanceCorrection(transaction: Prisma.TransactionClient, input: FinanceCorrectionMutation, verifyAccumulations: FinanceCorrectionAccumulationGuard): Promise<FinanceCorrectionResult> {
  const key = `${input.businessId}:finance:${input.command.type}:${input.idempotencyKey}`;
  await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${key},0))`;
  await authorizeFinanceMembership(transaction, input, correctionCapability(input.command));
  const where = { businessId_operation_idempotencyKey: { businessId: input.businessId, operation: input.command.type, idempotencyKey: input.idempotencyKey } };
  const prior = await transaction.financeRequest.findUnique({ where });
  if (prior) {
    if (prior.fingerprint !== input.fingerprint) throw new FinanceConflictError('La clave de reintento pertenece a otra intención.');
    return prior.result as unknown as FinanceCorrectionResult;
  }
  const requestId = randomUUID();
  const result = await appendCorrectionFact(transaction, input, requestId);
  await verifyAccumulations(transaction, input.businessId);
  await transaction.financeAudit.create({ data: { businessId: input.businessId, actorUserId: input.actorUserId, action: input.command.type, sourceId: result.id, details: financeJson({ command: input.command, result }) } });
  await transaction.financeRequest.create({ data: { id: requestId, businessId: input.businessId, operation: input.command.type, idempotencyKey: input.idempotencyKey, fingerprint: input.fingerprint, result: financeJson(result) } });
  return result;
}

async function appendCorrectionFact(transaction: Prisma.TransactionClient, input: FinanceCorrectionMutation, requestId: string): Promise<FinanceCorrectionResult> {
  const { type, ...command } = input.command;
  const scope = { ...command, businessId: input.businessId, actorUserId: input.actorUserId, requestId };
  if (input.command.type === 'SET_TERMINAL_FINAL_AMOUNT') return appendTerminalFinalAmount(transaction, { ...scope, finalAmountMinor: input.command.finalAmountMinor });
  if (input.command.type === 'VOID_PAYMENT') return appendPaymentAdjustment(transaction, { ...scope, paymentId: input.command.paymentId, expectedPaymentVersion: input.command.expectedPaymentVersion, kind: 'VOID' });
  void type;
  return appendPaymentAdjustment(transaction, { ...scope, paymentId: input.command.paymentId, expectedPaymentVersion: input.command.expectedPaymentVersion, kind: 'REFUND', amountMinor: input.command.amountMinor, occurredAt: input.command.occurredAt, accountId: input.command.accountId, expectedAccountVersion: input.command.expectedAccountVersion, reference: input.command.reference }, resolveFinanceRefundAccount);
}

@Injectable()
export class PrismaFinanceCorrectionsRepository implements FinanceCorrectionsRepository {
  constructor(private readonly prisma: PrismaService, @Inject(FINANCE_CORRECTIONS_ACCUMULATION_GUARD) private readonly verifyAccumulations: FinanceCorrectionAccumulationGuard) {}

  execute(input: FinanceCorrectionMutation): Promise<FinanceCorrectionResult> {
    return this.prisma.$transaction((transaction) => executeFinanceCorrection(transaction, input, this.verifyAccumulations), { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, maxWait: 5000, timeout: 30000 });
  }

  read(actor: FinanceActor): Promise<FinanceCorrectionsData> {
    return this.prisma.$transaction(async (transaction) => { const business = await authorizeFinance(transaction, actor, false); return readFinanceCorrections(transaction, actor.businessId, business.timezone); }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, maxWait: 5000, timeout: 30000 });
  }
}
