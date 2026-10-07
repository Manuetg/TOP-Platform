import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../business/business.contract';
import { FinanceConflictError } from '../domain/finance.errors';
import type { FinanceRepository, FinanceActor, FinanceQuery, FinanceMutation, FinanceResult, FinanceReport, FinanceExpense, FinanceAuditItem, MovementSource } from '../domain/finance.types';
import { authorizeFinance, findFinanceExpense, financeJson, localFinanceDate } from './finance-prisma-context';
import { dispatchFinanceCommand } from './finance-command.dispatcher';
import { loadFinanceSources } from './finance-report.loader';
import { mapFinanceReport } from './finance-report.mapper';
import { mapFinanceExpense } from './finance-expense.mapper';
import { financeCommandCapability } from '../application/finance-command-rules';
import { guardFinanceAccumulations } from './finance-accumulation.guard';
import { readFinanceAudit } from './finance-audit.reader';

@Injectable()
export class PrismaFinanceRepository implements FinanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  execute(input: FinanceMutation): Promise<FinanceResult> {
    return this.prisma.$transaction(async (tx) => {
      await authorizeFinance(tx, input, true, financeCommandCapability(input.command));
      const where = { businessId_operation_idempotencyKey: { businessId: input.businessId, operation: input.command.type, idempotencyKey: input.idempotencyKey } };
      const prior = await tx.financeRequest.findUnique({ where });
      if (prior) {
        if (prior.fingerprint !== input.fingerprint) throw new FinanceConflictError('La clave de reintento pertenece a otra intención.');
        return prior.result as unknown as FinanceResult;
      }
      if (input.command.type === 'CREATE_EXPENSE') {
        const policies = await tx.financeApprovalPolicyRevision.findMany({ where: { businessId: input.businessId }, orderBy: { version: 'desc' }, take: 1 });
        if (policies[0]?.enabled) throw new FinanceConflictError('La política vigente requiere un borrador aprobado antes de confirmar el gasto.');
      }
      const result = await dispatchFinanceCommand(tx, input);
      await guardFinanceAccumulations(tx, input.businessId);
      await tx.financeAudit.create({ data: { businessId: input.businessId, action: input.command.type, sourceId: result.id, actorUserId: input.actorUserId, details: financeJson({ command: input.command, result }) } });
      await tx.financeRequest.create({ data: { businessId: input.businessId, operation: input.command.type, idempotencyKey: input.idempotencyKey, fingerprint: input.fingerprint, result: financeJson(result) } });
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 30000 });
  }

  report(actor: FinanceActor, query: FinanceQuery): Promise<FinanceReport> {
    return this.prisma.$transaction(async (tx) => {
      const business = await authorizeFinance(tx, actor, false);
      const sources = await loadFinanceSources(tx, actor.businessId, query.from, query.to, business.timezone);
      return mapFinanceReport(actor, query, business.timezone, sources, new Date());
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }

  expense(actor: FinanceActor, expenseId: string): Promise<{ expense: FinanceExpense; audit: FinanceAuditItem[] }> {
    return this.prisma.$transaction(async (tx) => {
      const business = await authorizeFinance(tx, actor, false);
      const row = await findFinanceExpense(tx, actor.businessId, expenseId);
      const audits = await tx.financeAudit.findMany({ where: { businessId: actor.businessId, sourceId: row.id }, orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }] });
      return { expense: mapFinanceExpense(row, localFinanceDate(new Date(), business.timezone)), audit: audits.map((audit) => ({ id: audit.id, action: audit.action, sourceId: audit.sourceId, actorUserId: audit.actorUserId, occurredAt: audit.occurredAt.toISOString(), details: audit.details })) };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }

  audit(actor: FinanceActor, sourceType: MovementSource, sourceId: string): Promise<FinanceAuditItem[]> {
    return this.prisma.$transaction(async (tx) => {
      await authorizeFinance(tx, actor, false);
      return readFinanceAudit(tx, actor.businessId, sourceType, sourceId);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 30000 });
  }
}
