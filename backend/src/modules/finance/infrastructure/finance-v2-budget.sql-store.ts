import { randomUUID } from 'node:crypto';
import type { FinanceV2Mutation, FinanceBudgetDto, FinanceBudgetRevisionDto, FinanceBudgetLineDto, FinanceCommitmentDto, FinanceExpenseDraftDto, BudgetLineInput, CommitmentExpenseInput } from '../domain/finance-v2.types';
import { handleFinanceBudgetCommand, type FinanceBudgetStore } from '../application/finance-v2-budget.handler';
import { requireExactVersion, requireExpenseConfirmation } from '../application/finance-v2-policy.rules';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney, sumMoney } from '../domain/finance-money';
import type { FinanceSqlTransaction, FinanceV2CommandHandler } from './finance-v2.repository';
import { FinanceV2AtomicExpenseWriter, BookingCostReferenceReader } from './finance-v2-expense.writer';
import { FinanceV2DraftSqlStore, requireUpdated, sqlDate, sqlInstant } from './finance-v2-draft.sql-store';

type BudgetRow = Omit<FinanceBudgetDto, 'approvedRevisionId' | 'revisions'>;
type BudgetRevisionRow = Omit<FinanceBudgetRevisionDto, 'lines' | 'createdAt' | 'approvedAt'> & { createdAt: Date; approvedAt: Date | null };
type CommitmentRow = Omit<FinanceCommitmentDto, 'amountMinor' | 'consumedMinor' | 'pendingMinor' | 'conversions' | 'expectedConsumptionOn' | 'dueOn' | 'createdAt'> & { amountMinor: bigint; expectedConsumptionOn: Date; dueOn: Date | null; createdAt: Date };

export class FinanceV2BudgetSqlStore implements FinanceBudgetStore {
  constructor(private readonly tx: FinanceSqlTransaction, private readonly expenses: FinanceV2AtomicExpenseWriter, private readonly drafts: FinanceV2DraftSqlStore) {}
  async budgetByMonth(businessId: string, month: string): Promise<FinanceBudgetDto | null> {
    const rows = await this.tx.query<BudgetRow>('SELECT * FROM "FinanceBudget" WHERE "businessId"=$1 AND "periodMonth"=$2 AND kind=\'OPERATING_COST\'', [businessId, month]);
    return rows[0] ? this.loadBudget(rows[0]) : null;
  }
  private async loadBudget(row: BudgetRow): Promise<FinanceBudgetDto> {
    const revisionRows = await this.tx.query<BudgetRevisionRow>('SELECT * FROM "FinanceBudgetRevision" WHERE "businessId"=$1 AND "budgetId"=$2 ORDER BY "revisionNo"', [row.businessId, row.id]);
    const lines = revisionRows.length ? await this.tx.query<Omit<FinanceBudgetLineDto, 'approvedMinor'> & { approvedMinor: bigint; revisionId: string }>('SELECT * FROM "FinanceBudgetLine" WHERE "businessId"=$1 AND "revisionId"=ANY($2::text[]) ORDER BY "revisionId",ordinal', [row.businessId, revisionRows.map(revision => revision.id)]) : [];
    const revisions = revisionRows.map(revision => ({ ...revision, createdAt: sqlInstant(revision.createdAt), approvedAt: revision.approvedAt === null ? null : sqlInstant(revision.approvedAt), lines: lines.filter(line => line.revisionId === revision.id).map(line => ({ ...line, approvedMinor: safeMoney(line.approvedMinor) })) }));
    return { ...row, approvedRevisionId: [...revisions].reverse().find(revision => revision.approvedAt !== null)?.id ?? null, revisions };
  }
  async budgetByRevision(businessId: string, revisionId: string): Promise<{budget:FinanceBudgetDto;revision:FinanceBudgetRevisionDto}|null> {
    const rows = await this.tx.query<BudgetRow>('SELECT b.* FROM "FinanceBudget" b JOIN "FinanceBudgetRevision" r ON r."budgetId"=b.id AND r."businessId"=b."businessId" WHERE b."businessId"=$1 AND r.id=$2', [businessId, revisionId]);
    if (!rows[0]) return null;
    const budget = await this.loadBudget(rows[0]);
    return { budget, revision: budget.revisions.find(revision => revision.id === revisionId)! };
  }
  async validateBudgetLines(businessId: string, lines: readonly BudgetLineInput[]): Promise<void> {
    const categoryIds = [...new Set(lines.flatMap(line => line.categoryId ? [line.categoryId] : []))];
    const resourceIds = [...new Set(lines.flatMap(line => line.resourceId ? [line.resourceId] : []))];
    const categories = categoryIds.length ? await this.tx.query<{ id: string }>('SELECT id FROM "FinanceCatalog" WHERE "businessId"=$1 AND kind=\'CATEGORY\' AND archived=false AND id=ANY($2::text[])', [businessId, categoryIds]) : [];
    const resources = resourceIds.length ? await this.tx.query<{ id: string }>('SELECT id FROM "Resource" WHERE "businessId"=$1 AND id=ANY($2::text[])', [businessId, resourceIds]) : [];
    if (categories.length !== categoryIds.length || resources.length !== resourceIds.length) throw new FinanceNotFoundError('Dimensión presupuestaria no disponible.');
  }
  async appendBudgetRevision(input: FinanceV2Mutation, existing: FinanceBudgetDto | null): Promise<FinanceBudgetDto> {
    if (input.command.type !== 'CREATE_BUDGET_REVISION') throw new FinanceConflictError('Intención presupuestaria inválida.');
    const c = input.command; const id = existing?.id ?? randomUUID(); const revisionId = randomUUID();
    if (existing) await requireUpdated(this.tx, 'UPDATE "FinanceBudget" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, id, existing.version]);
    else await this.tx.execute('INSERT INTO "FinanceBudget" (id,"businessId","periodMonth",kind,version,"recordedByUserId","createdAt") VALUES ($1,$2,$3,\'OPERATING_COST\',1,$4,CURRENT_TIMESTAMP)', [id, input.businessId, c.periodMonth, input.actorUserId]);
    await this.tx.execute('INSERT INTO "FinanceBudgetRevision" (id,"businessId","budgetId","revisionNo",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)', [revisionId, input.businessId, id, (existing?.revisions.at(-1)?.revisionNo ?? 0) + 1, c.reason, input.actorUserId]);
    for (let ordinal = 0; ordinal < c.lines.length; ordinal++) {
      const line = c.lines[ordinal];
      await this.tx.execute('INSERT INTO "FinanceBudgetLine" (id,"businessId","revisionId",ordinal,"categoryId","resourceId","approvedMinor","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, revisionId, ordinal, line.categoryId, line.resourceId, BigInt(line.approvedMinor)]);
    }
    return (await this.budgetByMonth(input.businessId, c.periodMonth))!;
  }
  async approveBudgetRevision(input: FinanceV2Mutation, budget: FinanceBudgetDto, revision: FinanceBudgetRevisionDto): Promise<FinanceBudgetDto> {
    await requireUpdated(this.tx, 'UPDATE "FinanceBudget" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, budget.id, budget.version]);
    await requireUpdated(this.tx, 'UPDATE "FinanceBudgetRevision" SET "approvedByUserId"=$3,"approvedAt"=CURRENT_TIMESTAMP WHERE "businessId"=$1 AND id=$2 AND "approvedAt" IS NULL', [input.businessId, revision.id, input.actorUserId]);
    return (await this.budgetByMonth(input.businessId, budget.periodMonth))!;
  }
  async commitment(businessId: string, id: string): Promise<FinanceCommitmentDto | null> {
    const rows = await this.tx.query<CommitmentRow>('SELECT * FROM "FinanceCommitment" WHERE "businessId"=$1 AND id=$2', [businessId, id]);
    const row = rows[0]; if (!row) return null;
    const conversionRows = await this.tx.query<{ id: string; expenseId: string; consumedMinor: bigint; recordedByUserId: string; createdAt: Date }>('SELECT * FROM "FinanceCommitmentConversion" WHERE "businessId"=$1 AND "commitmentId"=$2 ORDER BY "createdAt",id', [businessId, id]);
    const conversions = conversionRows.map(conversion => ({ ...conversion, consumedMinor: safeMoney(conversion.consumedMinor), createdAt: sqlInstant(conversion.createdAt) }));
    const amountMinor = safeMoney(row.amountMinor); const consumedMinor = sumMoney(conversions.map(conversion => conversion.consumedMinor));
    if (consumedMinor > amountMinor) throw new FinanceConflictError('El compromiso tiene conversiones inválidas.');
    return { ...row, amountMinor, consumedMinor, pendingMinor: row.state === 'ACTIVE' ? amountMinor - consumedMinor : 0, expectedConsumptionOn: sqlDate(row.expectedConsumptionOn), dueOn: row.dueOn === null ? null : sqlDate(row.dueOn), createdAt: sqlInstant(row.createdAt), conversions };
  }
  async createCommitment(input: FinanceV2Mutation): Promise<FinanceCommitmentDto> {
    if (input.command.type !== 'CREATE_COMMITMENT') throw new FinanceConflictError('Intención de compromiso inválida.');
    const c = input.command; const id = randomUUID();
    await this.tx.execute('INSERT INTO "FinanceCommitment" (id,"businessId",description,"amountMinor","categoryId","resourceId","expectedConsumptionOn","dueOn",operational,reference,version,state,reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7::date,$8::date,$9,$10,1,\'ACTIVE\',$11,$12,CURRENT_TIMESTAMP)', [id, input.businessId, c.description, BigInt(c.amountMinor), c.categoryId, c.resourceId, c.expectedConsumptionOn, c.dueOn, c.operational, c.reference, c.reason, input.actorUserId]);
    return (await this.commitment(input.businessId, id))!;
  }
  async cancelCommitment(input: FinanceV2Mutation, commitment: FinanceCommitmentDto): Promise<FinanceCommitmentDto> {
    if (input.command.type !== 'CANCEL_COMMITMENT') throw new FinanceConflictError('Intención de cancelación inválida.');
    await requireUpdated(this.tx, 'UPDATE "FinanceCommitment" SET state=\'CANCELLED\',version=version+1,"cancelledByUserId"=$4,"cancelledAt"=CURRENT_TIMESTAMP,"cancelReason"=$5 WHERE "businessId"=$1 AND id=$2 AND version=$3 AND state=\'ACTIVE\'', [input.businessId, commitment.id, commitment.version, input.actorUserId, input.command.reason]);
    return (await this.commitment(input.businessId, commitment.id))!;
  }
  async draftForConversion(businessId: string, id: string, expectedVersion: number): Promise<FinanceExpenseDraftDto> {
    const draft = await this.drafts.draft(businessId, id);
    if (!draft) throw new FinanceNotFoundError('Borrador no disponible.');
    requireExactVersion(draft.version, expectedVersion);
    const policy = await this.drafts.policy(businessId, draft.submissionVersion === null ? undefined : draft.approvalPolicyRevisionId);
    requireExpenseConfirmation(policy, draft);
    if (draft.reimbursement) throw new FinanceConflictError('Un reintegro no convierte un compromiso comercial.');
    return draft;
  }
  async convertCommitment(input: FinanceV2Mutation, commitment: FinanceCommitmentDto, expense: CommitmentExpenseInput, draft: FinanceExpenseDraftDto | null): Promise<{expenseId:string;conversionId:string;version:number}> {
    const created = await this.expenses.createExpense(input, { expenseDefinition: expense, consumedOn: expense.consumedOn, dueOn: expense.dueOn, settlement: expense.settlement, approvedDraft: draft });
    const conversionId = randomUUID();
    await this.tx.execute('INSERT INTO "FinanceCommitmentConversion" (id,"businessId","commitmentId","expenseId","consumedMinor","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6,CURRENT_TIMESTAMP)', [conversionId, input.businessId, commitment.id, created.expenseId, BigInt(expense.amountMinor), input.actorUserId]);
    await requireUpdated(this.tx, 'UPDATE "FinanceCommitment" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3 AND state=\'ACTIVE\'', [input.businessId, commitment.id, commitment.version]);
    if (draft) await this.drafts.changeDraftState(input, draft, { state: 'CONFIRMED', confirmedExpenseId: created.expenseId });
    return { expenseId: created.expenseId, conversionId, version: commitment.version + 1 };
  }
}

export class FinanceV2BudgetCommandHandler implements FinanceV2CommandHandler {
  readonly commandTypes = ['CREATE_BUDGET_REVISION','APPROVE_BUDGET_REVISION','CREATE_COMMITMENT','CANCEL_COMMITMENT','CONVERT_COMMITMENT'] as const;
  constructor(private readonly bookingReader: BookingCostReferenceReader) {}
  async bookingReferences(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<readonly string[]> {
    const c = input.command;
    if (c.type !== 'CONVERT_COMMITMENT') return [];
    if (c.expense) return c.expense.lines.flatMap(line => line.bookingId ? [line.bookingId] : []);
    const rows = await tx.query<{ bookingId: string }>('SELECT l."bookingId" FROM "FinanceExpenseDraftLine" l JOIN "FinanceExpenseDraft" d ON d.id=l."draftId" AND d."businessId"=l."businessId" AND d."definitionVersion"=l."definitionVersion" WHERE l."businessId"=$1 AND d.id=$2 AND l."bookingId" IS NOT NULL', [input.businessId, c.expenseDraftId]);
    return rows.map(row => row.bookingId);
  }
  execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>): ReturnType<typeof handleFinanceBudgetCommand> {
    const expenses = new FinanceV2AtomicExpenseWriter(tx, this.bookingReader, lockedBookingIds);
    return handleFinanceBudgetCommand(new FinanceV2BudgetSqlStore(tx, expenses, new FinanceV2DraftSqlStore(tx, expenses)), input);
  }
}
