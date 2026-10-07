import type { FinanceV2Actor, FinanceV2PageQuery, FinanceV2Page, FinanceV2ReadRepository, FinanceAllocationRuleDto, FinanceLaborCostDto, FinanceExpenseTemplateDto, FinanceExpenseTemplateRevisionDto, FinanceV2AuditItem,FinanceBudgetComparison,FinanceBudgetForecastBasis } from '../domain/finance-v2.types';
import { FinanceForbiddenError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { parseFinanceUuid } from '../domain/finance-validation';
import { safeMoney } from '../domain/finance-money';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceBankReadHost } from './finance-v2-bank.read-service';
import { FinanceV2AtomicExpenseWriter, BookingCostReferenceReader } from './finance-v2-expense.writer';
import { FinanceV2DraftSqlStore, sqlDate, sqlInstant } from './finance-v2-draft.sql-store';
import { FinanceV2BudgetSqlStore } from './finance-v2-budget.sql-store';
import { validatePeriodMonth } from '../application/finance-v2-budget.handler';
import { compareFinanceV2Budget } from './finance-v2-budget.comparison-reader';
import { readFinanceV2CostReport } from './finance-v2-cost.report-reader';

export async function authorizeFinanceV2Read(tx: FinanceSqlTransaction, actor: FinanceV2Actor): Promise<{ timeZone: string }> {
  parseFinanceUuid(actor.actorUserId); parseFinanceUuid(actor.businessId);
  const rows = await tx.query<{ status: string; role: string; timeZone: string; currency: string }>('SELECT u.status,m.role,b.timezone AS "timeZone",b.currency FROM "User" u JOIN "UserBusinessMembership" m ON m."userId"=u.id JOIN "Business" b ON b.id=m."businessId" WHERE u.id=$1 AND m."businessId"=$2', [actor.actorUserId, actor.businessId]);
  if (rows[0]?.status !== 'ACTIVE' || rows[0].role !== 'OWNER') throw new FinanceForbiddenError('Acceso financiero no autorizado.');
  if (rows[0].currency !== 'PYG') throw new FinanceInputError('Finance admite únicamente PYG.');
  return { timeZone: rows[0].timeZone };
}

interface PageCursor { id: string }
export function financeV2Cursor(query: FinanceV2PageQuery): PageCursor | null {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) throw new FinanceInputError('Límite de página inválido.');
  if (query.cursor === null) return null;
  return { id: parseFinanceUuid(query.cursor) };
}
export function financeV2Page<T>(items: T[], rawRows: readonly { id: string }[], limit: number): FinanceV2Page<T> {
  const last = rawRows[Math.min(rawRows.length, limit) - 1];
  return { items: items.slice(0, limit), nextCursor: rawRows.length > limit ? last.id : null };
}

export class FinanceV2OperationalReadService implements Pick<FinanceV2ReadRepository, 'drafts' | 'draft' | 'approvalPolicy' | 'templates' | 'budget' | 'commitments' | 'allocationRules' | 'laborCosts'> {
  constructor(private readonly host: FinanceBankReadHost, private readonly bookingReader: BookingCostReferenceReader) {}
  private stores(tx: FinanceSqlTransaction) {
    const expense = new FinanceV2AtomicExpenseWriter(tx, this.bookingReader, new Set());
    const drafts = new FinanceV2DraftSqlStore(tx, expense);
    return { drafts, budget: new FinanceV2BudgetSqlStore(tx, expense, drafts) };
  }
  drafts(actor: FinanceV2Actor, query: FinanceV2PageQuery): ReturnType<FinanceV2ReadRepository['drafts']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); const cursor = financeV2Cursor(query);
      const rows = await tx.query<{ id: string; createdAt: Date }>('SELECT id,"createdAt" FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND ($2::text IS NULL OR id<$2::text) ORDER BY id DESC LIMIT $3', [actor.businessId, cursor?.id ?? null, query.limit + 1]);
      const store = this.stores(tx).drafts; const items = [];
      for (const row of rows.slice(0, query.limit)) items.push((await store.draft(actor.businessId, row.id))!);
      return financeV2Page(items, rows, query.limit);
    });
  }
  draft(actor: FinanceV2Actor, id: string): ReturnType<FinanceV2ReadRepository['draft']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); parseFinanceUuid(id);
      const draft = await this.stores(tx).drafts.draft(actor.businessId, id);
      if (!draft) throw new FinanceNotFoundError('Borrador no disponible.');
      const rows = await tx.query<FinanceV2AuditItem & { occurredAt: Date }>('SELECT * FROM "FinanceAudit" WHERE "businessId"=$1 AND "sourceId"=$2 AND action LIKE \'FINANCE_V2.%\' ORDER BY "occurredAt",id LIMIT 5001', [actor.businessId, id]);
      if (rows.length > 5000) throw new FinanceInputError('La consulta supera 5000 fuentes.');
      return { draft, audit: rows.map(row => ({ ...row, occurredAt: sqlInstant(row.occurredAt) })) };
    });
  }
  approvalPolicy(actor: FinanceV2Actor): ReturnType<FinanceV2ReadRepository['approvalPolicy']> { return this.host.read(async tx => { await authorizeFinanceV2Read(tx, actor); return this.stores(tx).drafts.policy(actor.businessId); }); }
  budget(actor: FinanceV2Actor, periodMonth: string): ReturnType<FinanceV2ReadRepository['budget']> { validatePeriodMonth(periodMonth); return this.host.read(async tx => { await authorizeFinanceV2Read(tx, actor); return this.stores(tx).budget.budgetByMonth(actor.businessId, periodMonth); }); }
  budgetComparison(actor:FinanceV2Actor,periodMonth:string,forecastBasis:FinanceBudgetForecastBasis|null=null):Promise<FinanceBudgetComparison>{
    validatePeriodMonth(periodMonth);
    return this.host.read(async tx=>{
      const business=await authorizeFinanceV2Read(tx,actor);
      const from=periodMonth+'-01';const next=new Date(`${from}T00:00:00.000Z`);next.setUTCMonth(next.getUTCMonth()+1);const to=next.toISOString().slice(0,10);const asOf=new Date().toISOString();
      const store=this.stores(tx).budget;const budget=await store.budgetByMonth(actor.businessId,periodMonth);
      const costs=await readFinanceV2CostReport(tx,{businessId:actor.businessId,timeZone:business.timeZone,from,to,asOf});
      const ids=await tx.query<{id:string}>('SELECT id FROM "FinanceCommitment" WHERE "businessId"=$1 AND "expectedConsumptionOn">=$2::date AND "expectedConsumptionOn"<$3::date AND state=\'ACTIVE\' ORDER BY id LIMIT 5001',[actor.businessId,from,to]);
      if(ids.length>5000)throw new FinanceInputError('La consulta supera 5000 fuentes.');
      const commitments=[];for(const row of ids)commitments.push((await store.commitment(actor.businessId,row.id))!);
      return compareFinanceV2Budget({budget,costs,commitments,forecastBasis});
    });
  }
  commitments(actor: FinanceV2Actor, query: FinanceV2PageQuery): ReturnType<FinanceV2ReadRepository['commitments']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); const cursor = financeV2Cursor(query);
      const rows = await tx.query<{ id: string; createdAt: Date }>('SELECT id,"createdAt" FROM "FinanceCommitment" WHERE "businessId"=$1 AND ($2::text IS NULL OR id<$2::text) ORDER BY id DESC LIMIT $3', [actor.businessId, cursor?.id ?? null, query.limit + 1]);
      const store = this.stores(tx).budget; const items = [];
      for (const row of rows.slice(0, query.limit)) items.push((await store.commitment(actor.businessId, row.id))!);
      return financeV2Page(items, rows, query.limit);
    });
  }
  templates(actor: FinanceV2Actor, query: FinanceV2PageQuery): ReturnType<FinanceV2ReadRepository['templates']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); const cursor = financeV2Cursor(query);
      const rows = await tx.query<Omit<FinanceExpenseTemplateDto, 'createdAt' | 'revisions'> & { createdAt: Date }>('SELECT * FROM "FinanceExpenseTemplate" WHERE "businessId"=$1 AND ($2::text IS NULL OR id<$2::text) ORDER BY id DESC LIMIT $3', [actor.businessId, cursor?.id ?? null, query.limit + 1]);
      const items: FinanceExpenseTemplateDto[] = [];
      for (const row of rows.slice(0, query.limit)) {
        const revisions = await tx.query<{ id: string; revisionNo: number; description: string; counterpartyId: string | null; reference: string | null; amountMinor: bigint; reason: string; recordedByUserId: string; createdAt: Date }>('SELECT * FROM "FinanceExpenseTemplateRevision" WHERE "businessId"=$1 AND "templateId"=$2 ORDER BY "revisionNo" LIMIT 5001', [actor.businessId, row.id]);
        if (revisions.length > 5000) throw new FinanceInputError('Demasiadas revisiones.');
        const revisionDtos: FinanceExpenseTemplateRevisionDto[] = [];
        for (const revision of revisions) {
          const lines = await tx.query<{ label: string; categoryId: string; resourceId: string | null; bookingId: string | null; amountMinor: bigint; operational: boolean }>('SELECT * FROM "FinanceExpenseTemplateLine" WHERE "businessId"=$1 AND "revisionId"=$2 ORDER BY ordinal', [actor.businessId, revision.id]);
          revisionDtos.push({ id: revision.id, revisionNo: revision.revisionNo, reason: revision.reason, recordedByUserId: revision.recordedByUserId, createdAt: sqlInstant(revision.createdAt), expenseDefinition: { description: revision.description, counterpartyId: revision.counterpartyId, reference: revision.reference, amountMinor: safeMoney(revision.amountMinor), lines: lines.map(line => ({ ...line, amountMinor: safeMoney(line.amountMinor) })) } });
        }
        items.push({ ...row, createdAt: sqlInstant(row.createdAt), revisions: revisionDtos });
      }
      return financeV2Page(items, rows, query.limit);
    });
  }
  allocationRules(actor: FinanceV2Actor, query: FinanceV2PageQuery): ReturnType<FinanceV2ReadRepository['allocationRules']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); const cursor = financeV2Cursor(query);
      const rows = await tx.query<Omit<FinanceAllocationRuleDto, 'revisions'> & { createdAt: Date }>('SELECT * FROM "FinanceAllocationRule" WHERE "businessId"=$1 AND ($2::text IS NULL OR id<$2::text) ORDER BY id DESC LIMIT $3', [actor.businessId, cursor?.id ?? null, query.limit + 1]);
      const items: FinanceAllocationRuleDto[] = [];
      for (const row of rows.slice(0, query.limit)) {
        const revisions = await tx.query<Omit<FinanceAllocationRuleDto['revisions'][number], 'parts' | 'createdAt' | 'validFrom' | 'validTo'> & { createdAt: Date; validFrom: Date; validTo: Date | null }>('SELECT * FROM "FinanceAllocationRuleRevision" WHERE "businessId"=$1 AND "ruleId"=$2 ORDER BY "revisionNo" LIMIT 5001', [actor.businessId, row.id]);
        if (revisions.length > 5000) throw new FinanceInputError('Demasiadas revisiones.');
        const values: FinanceAllocationRuleDto['revisions'] = [];
        for (const revision of revisions) values.push({ ...revision, createdAt: sqlInstant(revision.createdAt), validFrom: sqlDate(revision.validFrom), validTo: revision.validTo === null ? null : sqlDate(revision.validTo), parts: await tx.query<{ resourceId: string; basisPoints: number }>('SELECT "resourceId","basisPoints" FROM "FinanceAllocationRulePart" WHERE "businessId"=$1 AND "revisionId"=$2 ORDER BY "resourceId"', [actor.businessId, revision.id]) });
        items.push({ id: row.id, businessId: row.businessId, name: row.name, archived: row.archived, version: row.version, revisions: values });
      }
      return financeV2Page(items, rows, query.limit);
    });
  }
  laborCosts(actor: FinanceV2Actor, query: FinanceV2PageQuery): ReturnType<FinanceV2ReadRepository['laborCosts']> {
    return this.host.read(async tx => {
      await authorizeFinanceV2Read(tx, actor); const cursor = financeV2Cursor(query);
      const rows = await tx.query<Omit<FinanceLaborCostDto, 'revisions' | 'consumedOn'> & { consumedOn: Date; createdAt: Date }>('SELECT * FROM "FinanceLaborCost" WHERE "businessId"=$1 AND ($2::text IS NULL OR id<$2::text) ORDER BY id DESC LIMIT $3', [actor.businessId, cursor?.id ?? null, query.limit + 1]);
      const items: FinanceLaborCostDto[] = [];
      for (const row of rows.slice(0, query.limit)) {
        const revisions = await tx.query<Omit<FinanceLaborCostDto['revisions'][number], 'estimatedMinor' | 'createdAt'> & { estimatedMinor: bigint | null; createdAt: Date }>('SELECT * FROM "FinanceLaborCostRevision" WHERE "businessId"=$1 AND "laborId"=$2 ORDER BY "revisionNo" LIMIT 5001', [actor.businessId, row.id]);
        if (revisions.length > 5000) throw new FinanceInputError('Demasiadas revisiones.');
        items.push({ id: row.id, businessId: row.businessId, label: row.label, personLabel: row.personLabel, periodMonth: row.periodMonth, consumedOn: sqlDate(row.consumedOn), kind: row.kind, version: row.version, revisions: revisions.map(revision => ({ ...revision, estimatedMinor: revision.estimatedMinor === null ? null : safeMoney(revision.estimatedMinor), createdAt: sqlInstant(revision.createdAt) })) });
      }
      return financeV2Page(items, rows, query.limit);
    });
  }
}
