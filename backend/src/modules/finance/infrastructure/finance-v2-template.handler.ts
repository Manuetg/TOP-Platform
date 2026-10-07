import { randomUUID } from 'node:crypto';
import type { ExpenseDefinition, FinanceV2Mutation, FinanceV2Result } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import { requireExactVersion } from '../application/finance-v2-policy.rules';
import { validatePeriodMonth } from '../application/finance-v2-budget.handler';
import { planningDate } from '../application/finance-v2-planning.rules';
import type { FinanceSqlTransaction, FinanceV2CommandHandler } from './finance-v2.repository';
import { FinanceV2AtomicExpenseWriter, BookingCostReferenceReader } from './finance-v2-expense.writer';
import { FinanceV2DraftSqlStore, requireUpdated } from './finance-v2-draft.sql-store';

type ExpenseTemplateCommand = Extract<FinanceV2Mutation['command'], { type: 'CREATE_EXPENSE_TEMPLATE' | 'REVISE_EXPENSE_TEMPLATE' }>;
type RecurringDraftCommand = Extract<FinanceV2Mutation['command'], { type: 'GENERATE_RECURRING_DRAFT' }>;

export class FinanceV2TemplateCommandHandler implements FinanceV2CommandHandler {
  readonly commandTypes = ['CREATE_EXPENSE_TEMPLATE','REVISE_EXPENSE_TEMPLATE','GENERATE_RECURRING_DRAFT'] as const;
  constructor(private readonly bookingReader: BookingCostReferenceReader) {}
  async bookingReferences(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<readonly string[]> {
    const c = input.command;
    if ('expenseDefinition' in c) return c.expenseDefinition.lines.flatMap(line => line.bookingId ? [line.bookingId] : []);
    if (c.type !== 'GENERATE_RECURRING_DRAFT') return [];
    const rows = await tx.query<{ bookingId: string }>('SELECT l."bookingId" FROM "FinanceExpenseTemplateLine" l JOIN "FinanceExpenseTemplateRevision" r ON r.id=l."revisionId" AND r."businessId"=l."businessId" WHERE r."businessId"=$1 AND r."templateId"=$2 AND r."revisionNo"=(SELECT MAX("revisionNo") FROM "FinanceExpenseTemplateRevision" WHERE "businessId"=$1 AND "templateId"=$2) AND l."bookingId" IS NOT NULL', [input.businessId, c.templateId]);
    return rows.map(row => row.bookingId);
  }
  async execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>): Promise<FinanceV2Result> {
    const c = input.command; const expenses = new FinanceV2AtomicExpenseWriter(tx, this.bookingReader, lockedBookingIds);
    if (c.type === 'CREATE_EXPENSE_TEMPLATE' || c.type === 'REVISE_EXPENSE_TEMPLATE') return this.saveTemplate(tx, input, c, expenses);
    if (c.type !== 'GENERATE_RECURRING_DRAFT') throw new FinanceConflictError('Intención de recurrencia inválida.');
    return this.generateRecurringDraft(tx, input, c, expenses);
  }
  private async saveTemplate(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: ExpenseTemplateCommand, expenses: FinanceV2AtomicExpenseWriter): Promise<FinanceV2Result> {
    const bookings = await expenses.validateDefinition(input.businessId, c.expenseDefinition);
    const id = c.type === 'CREATE_EXPENSE_TEMPLATE' ? randomUUID() : c.id;
    const { revisionNo, version } = await this.templateVersion(tx, input, c, id);
    const revisionId = randomUUID(); const d = c.expenseDefinition;
    await tx.execute('INSERT INTO "FinanceExpenseTemplateRevision" (id,"businessId","templateId","revisionNo",description,"counterpartyId",reference,"amountMinor",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,CURRENT_TIMESTAMP)', [revisionId, input.businessId, id, revisionNo, d.description, d.counterpartyId, d.reference, BigInt(d.amountMinor), c.type === 'REVISE_EXPENSE_TEMPLATE' ? c.reason : 'Creación manual de plantilla', input.actorUserId]);
    for (let ordinal = 0; ordinal < d.lines.length; ordinal++) {
      const line = d.lines[ordinal]; const booking = line.bookingId ? bookings.get(line.bookingId) : null;
      await tx.execute('INSERT INTO "FinanceExpenseTemplateLine" (id,"businessId","revisionId",ordinal,label,"categoryId","resourceId","bookingId","bookingSourceUpdatedAt","bookingSourceStatus","amountMinor",operational,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::timestamp,$10::"BookingStatus",$11,$12,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, revisionId, ordinal, line.label, line.categoryId, line.resourceId, line.bookingId, booking?.updatedAt ?? null, booking?.status ?? null, BigInt(line.amountMinor), line.operational]);
    }
    return { id, version, type: c.type, relatedIds: { revisionId } };
  }
  private async templateVersion(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: ExpenseTemplateCommand, id: string): Promise<{ revisionNo: number; version: number }> {
    let revisionNo = 1; let version = 1;
    if (c.type === 'REVISE_EXPENSE_TEMPLATE') {
      const rows = await tx.query<{ version: number; archived: boolean; revisionNo: number }>('SELECT t.version,t.archived,COALESCE(MAX(r."revisionNo"),0)::int AS "revisionNo" FROM "FinanceExpenseTemplate" t LEFT JOIN "FinanceExpenseTemplateRevision" r ON r."templateId"=t.id AND r."businessId"=t."businessId" WHERE t."businessId"=$1 AND t.id=$2 GROUP BY t.id', [input.businessId, id]);
      if (!rows[0]) throw new FinanceNotFoundError('Plantilla no disponible.');
      requireExactVersion(rows[0].version, c.expectedVersion);
      if (rows[0].archived) throw new FinanceConflictError('Plantilla archivada.');
      await requireUpdated(tx, 'UPDATE "FinanceExpenseTemplate" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, id, c.expectedVersion]);
      revisionNo = rows[0].revisionNo + 1; version = rows[0].version + 1;
    } else await tx.execute('INSERT INTO "FinanceExpenseTemplate" (id,"businessId",name,archived,version,"recordedByUserId","createdAt") VALUES ($1,$2,$3,false,1,$4,CURRENT_TIMESTAMP)', [id, input.businessId, c.name, input.actorUserId]);
    return { revisionNo, version };
  }
  private async generateRecurringDraft(tx: FinanceSqlTransaction, input: FinanceV2Mutation, c: RecurringDraftCommand, expenses: FinanceV2AtomicExpenseWriter): Promise<FinanceV2Result> {
    validatePeriodMonth(c.periodMonth); planningDate(c.consumedOn); if (c.dueOn !== null) planningDate(c.dueOn);
    if (!c.consumedOn.startsWith(c.periodMonth + '-')) throw new FinanceConflictError('El consumo debe pertenecer al período elegido.');
    const templates = await tx.query<{ version: number; archived: boolean }>('SELECT version,archived FROM "FinanceExpenseTemplate" WHERE "businessId"=$1 AND id=$2', [input.businessId, c.templateId]);
    if (!templates[0]) throw new FinanceNotFoundError('Plantilla no disponible.');
    requireExactVersion(templates[0].version, c.expectedTemplateVersion);
    if (templates[0].archived) throw new FinanceConflictError('Plantilla archivada.');
    const existing = await tx.query<{ id: string; version: number }>('SELECT id,version FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND "templateId"=$2 AND "periodMonth"=$3', [input.businessId, c.templateId, c.periodMonth]);
    if (existing[0]) return { ...existing[0], type: c.type, alreadyGenerated: true };
    const revisions = await tx.query<ExpenseDefinition & { id: string; amountMinor: bigint }>('SELECT * FROM "FinanceExpenseTemplateRevision" WHERE "businessId"=$1 AND "templateId"=$2 ORDER BY "revisionNo" DESC LIMIT 1', [input.businessId, c.templateId]);
    if (!revisions[0]) throw new FinanceConflictError('Plantilla sin definición.');
    const revision = revisions[0];
    const lines = await tx.query<ExpenseDefinition['lines'][number] & { amountMinor: bigint }>('SELECT * FROM "FinanceExpenseTemplateLine" WHERE "businessId"=$1 AND "revisionId"=$2 ORDER BY ordinal', [input.businessId, revision.id]);
    const definition = { ...revision, amountMinor: safeMoney(revision.amountMinor), lines: lines.map(line => ({ ...line, amountMinor: safeMoney(line.amountMinor) })) };
    const drafts = new FinanceV2DraftSqlStore(tx, expenses);
    const draft = await drafts.createDraft(input, { expenseDefinition: definition, consumedOn: c.consumedOn, dueOn: c.dueOn, reimbursement: null });
    await requireUpdated(tx, 'UPDATE "FinanceExpenseDraft" SET "templateId"=$3,"templateRevisionId"=$4,"periodMonth"=$5 WHERE "businessId"=$1 AND id=$2 AND version=1', [input.businessId, draft.id, c.templateId, revision.id, c.periodMonth]);
    return { id: draft.id, version: draft.version, type: c.type, relatedIds: { revisionId: revision.id }, alreadyGenerated: false };
  }
}
