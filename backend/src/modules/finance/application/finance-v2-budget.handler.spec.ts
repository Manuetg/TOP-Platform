import type { CommitmentExpenseInput, FinanceBudgetDto, FinanceBudgetRevisionDto, FinanceCommitmentDto, FinanceExpenseDraftDto, FinanceV2Mutation } from '../domain/finance-v2.types';
import { handleFinanceBudgetCommand, type FinanceBudgetStore } from './finance-v2-budget.handler';
import { FinanceV2BudgetSqlStore } from '../infrastructure/finance-v2-budget.sql-store';
import { FinanceV2DraftSqlStore } from '../infrastructure/finance-v2-draft.sql-store';
import { FinanceV2AtomicExpenseWriter } from '../infrastructure/finance-v2-expense.writer';
import type { FinanceSqlTransaction } from '../infrastructure/finance-v2.repository';

const BIZ = '00000000-0000-0000-0000-000000000001';
const ACTOR = '00000000-0000-0000-0000-000000000002';
const CATEGORY = '00000000-0000-0000-0000-000000000003';
const RESOURCE = '00000000-0000-0000-0000-000000000004';
const BUDGET = '00000000-0000-0000-0000-000000000005';
const REVISION = '00000000-0000-0000-0000-000000000006';
const COMMITMENT = '00000000-0000-0000-0000-000000000007';
const EXPENSE = '00000000-0000-0000-0000-000000000008';
const DRAFT = '00000000-0000-0000-0000-000000000009';
type BudgetStoreMocks = { [K in keyof FinanceBudgetStore]: jest.MockedFunction<(...args: Parameters<FinanceBudgetStore[K]>) => ReturnType<FinanceBudgetStore[K]>> };
function mutation(command: FinanceV2Mutation['command']): FinanceV2Mutation { return { businessId: BIZ, actorUserId: ACTOR, idempotencyKey: 'budget-intent', fingerprint: 'budget-fingerprint', command }; }
function expense(amount = 600000): CommitmentExpenseInput { return { description: 'Servicio comprometido', amountMinor: amount, counterpartyId: null, reference: null, consumedOn: '2026-10-02', dueOn: null, settlement: null, lines: [{ label: 'Servicio', categoryId: CATEGORY, resourceId: RESOURCE, bookingId: null, amountMinor: amount, operational: true }] }; }
function revision(overrides: Partial<FinanceBudgetRevisionDto> = {}): FinanceBudgetRevisionDto { return { id: REVISION, revisionNo: 2, reason: 'Meta', recordedByUserId: ACTOR, createdAt: '2026-10-01T00:00:00.000Z', approvedAt: null, approvedByUserId: null, lines: [{ id: CATEGORY, ordinal: 0, categoryId: CATEGORY, resourceId: RESOURCE, approvedMinor: 1000000 }], ...overrides }; }
function budget(): FinanceBudgetDto { return { id: BUDGET, businessId: BIZ, periodMonth: '2026-10', kind: 'OPERATING_COST', version: 2, approvedRevisionId: CATEGORY, revisions: [revision({ id: CATEGORY, revisionNo: 1, approvedAt: '2026-10-01T00:00:00Z', approvedByUserId: ACTOR }), revision()] }; }
function commitment(overrides: Partial<FinanceCommitmentDto> = {}): FinanceCommitmentDto { return { id: COMMITMENT, businessId: BIZ, version: 1, state: 'ACTIVE', description: 'Servicio previsto', amountMinor: 900000, consumedMinor: 0, pendingMinor: 900000, categoryId: CATEGORY, resourceId: RESOURCE, expectedConsumptionOn: '2026-10-02', dueOn: null, operational: true, reference: null, reason: 'Plan', recordedByUserId: ACTOR, createdAt: '2026-10-01T00:00:00.000Z', conversions: [], ...overrides }; }
function approvedDraft(): FinanceExpenseDraftDto { const e = expense(); return { ...e, id: DRAFT, businessId: BIZ, version: 3, state: 'APPROVED', creatorUserId: ACTOR, createdAt: '2026-10-02T00:00:00.000Z', templateId: null, templateRevisionId: null, periodMonth: null, approvalPolicyRevisionId: REVISION, submissionVersion: 2, confirmedExpenseId: null, reimbursement: null, decisions: [], lines: e.lines.map((line, ordinal) => ({ ...line, id: CATEGORY, ordinal, categoryName: 'Servicio', resourceName: 'Unidad' })) }; }
function store(current = commitment(), currentBudget = budget()): BudgetStoreMocks { return {
  budgetByMonth: jest.fn().mockResolvedValue(currentBudget), budgetByRevision: jest.fn().mockResolvedValue({ budget: currentBudget, revision: currentBudget.revisions.at(-1)! }), validateBudgetLines: jest.fn().mockResolvedValue(undefined), appendBudgetRevision: jest.fn().mockResolvedValue({ ...currentBudget, version: currentBudget.version + 1 }), approveBudgetRevision: jest.fn().mockResolvedValue({ ...currentBudget, version: currentBudget.version + 1 }), commitment: jest.fn().mockResolvedValue(current), createCommitment: jest.fn().mockResolvedValue(current), cancelCommitment: jest.fn().mockResolvedValue({ ...current, state: 'CANCELLED', pendingMinor: 0, version: current.version + 1 }), draftForConversion: jest.fn().mockResolvedValue(approvedDraft()), convertCommitment: jest.fn().mockResolvedValue({ expenseId: EXPENSE, conversionId: REVISION, version: current.version + 1 }),
}; }
function convert(expectedVersion = 1, amount = 600000): FinanceV2Mutation { return mutation({ type: 'CONVERT_COMMITMENT', id: COMMITMENT, expectedVersion, expenseDraftId: null, expectedDraftVersion: null, expense: expense(amount), reason: 'Convertir' }); }
class SqlFake implements FinanceSqlTransaction {
  readonly writes: { sql: string; parameters: readonly unknown[] }[] = [];
  affected = 1;
  constructor(private readonly replies: object[][] = []) {}
  query<T extends object>(): Promise<T[]> { return Promise.resolve((this.replies.shift() ?? []) as T[]); }
  execute(sql: string, parameters: readonly unknown[]): Promise<number> { this.writes.push({ sql, parameters }); return Promise.resolve(this.affected); }
}
describe('Finance budget/commitment application guards', () => {
  it('appends a new draft revision without replacing the approved historical target', async () => {
    const current = budget(); const before = JSON.stringify(current); const s = store(commitment(), current);
    const request = mutation({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: 2, lines: [{ categoryId: CATEGORY, resourceId: RESOURCE, approvedMinor: 1200000 }], reason: 'Nueva meta' });
    await expect(handleFinanceBudgetCommand(s, request)).resolves.toMatchObject({ version: 3 }); expect(s.appendBudgetRevision).toHaveBeenCalledWith(request, current); expect(JSON.stringify(current)).toBe(before); expect(s.approveBudgetRevision).not.toHaveBeenCalled();
  });
  it('requires absence/CAS zero for initial budget creation and rejects a stale existing version', async () => {
    const s = store(); const command = { type: 'CREATE_BUDGET_REVISION' as const, periodMonth: '2026-10', expectedBudgetVersion: 0, lines: [{ categoryId: null, resourceId: null, approvedMinor: 0 }], reason: 'Meta cero conocida' };
    await expect(handleFinanceBudgetCommand(s, mutation(command))).rejects.toThrow('versión'); expect(s.appendBudgetRevision).not.toHaveBeenCalled();
    s.budgetByMonth.mockResolvedValue(null); await handleFinanceBudgetCommand(s, mutation(command)); expect(s.appendBudgetRevision).toHaveBeenCalledWith(expect.anything(), null);
  });
  it.each([
    [{ categoryId: null, resourceId: null, approvedMinor: 100 }, { categoryId: null, resourceId: null, approvedMinor: 200 }],
    [{ categoryId: CATEGORY, resourceId: RESOURCE, approvedMinor: 100 }, { categoryId: CATEGORY, resourceId: RESOURCE, approvedMinor: 200 }],
    [{ categoryId: null, resourceId: null, approvedMinor: -1 }],
    [{ categoryId: null, resourceId: null, approvedMinor: 1.5 }],
    [{ categoryId: null, resourceId: null, approvedMinor: Number.MAX_SAFE_INTEGER }, { categoryId: CATEGORY, resourceId: null, approvedMinor: 1 }],
  ])('rejects duplicate/unsafe dimensions before reading or appending a budget', async (...lines) => {
    const s = store(); await expect(handleFinanceBudgetCommand(s, mutation({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: 2, lines, reason: 'Meta' }))).rejects.toThrow(); expect(s.appendBudgetRevision).not.toHaveBeenCalled(); expect(s.budgetByMonth).not.toHaveBeenCalled();
  });
  it('rejects missing/cross-tenant dimension refs before persisting revision lines', async () => {
    const s = store(); s.validateBudgetLines.mockRejectedValue(new Error('Dimensión no disponible'));
    await expect(handleFinanceBudgetCommand(s, mutation({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: 2, lines: [{ categoryId: CATEGORY, resourceId: RESOURCE, approvedMinor: 100 }], reason: 'Meta' }))).rejects.toThrow('Dimensión'); expect(s.appendBudgetRevision).not.toHaveBeenCalled();
  });
  it('checks approval CAS before no-op and prevents approving an older/nonpending revision', async () => {
    const s = store(); const c = { type: 'APPROVE_BUDGET_REVISION' as const, id: REVISION, expectedBudgetVersion: 1, reason: 'Aprobar' };
    await expect(handleFinanceBudgetCommand(s, mutation(c))).rejects.toThrow('versión'); expect(s.approveBudgetRevision).not.toHaveBeenCalled();
    s.budgetByRevision.mockResolvedValue({ budget: budget(), revision: budget().revisions[0] });
    await expect(handleFinanceBudgetCommand(s, mutation({ ...c, expectedBudgetVersion: 2 }))).rejects.toThrow('vigente'); expect(s.approveBudgetRevision).not.toHaveBeenCalled();
  });
  it('partial conversion 900000 to Expense 600000 consumes the source exactly once and refuses the second 600000', async () => {
    const s = store(); const first = await handleFinanceBudgetCommand(s, convert()); expect(first.relatedIds?.expenseId).toBe(EXPENSE); expect(s.convertCommitment).toHaveBeenCalledTimes(1);
    s.commitment.mockResolvedValue(commitment({ version: 2, consumedMinor: 600000, pendingMinor: 300000, conversions: [{ id: REVISION, expenseId: EXPENSE, consumedMinor: 600000, recordedByUserId: ACTOR, createdAt: '2026-10-02T00:00:00Z' }] }));
    await expect(handleFinanceBudgetCommand(s, convert(2))).rejects.toThrow(); expect(s.convertCommitment).toHaveBeenCalledTimes(1);
    await expect(handleFinanceBudgetCommand(s, convert(1, 300000))).rejects.toThrow('versión'); expect(s.convertCommitment).toHaveBeenCalledTimes(1);
  });
  it('reads capacity from conversion relations rather than an editable pending/consumed counter', async () => {
    const s = store(commitment({ consumedMinor: 0, pendingMinor: 900000, conversions: [{ id: REVISION, expenseId: EXPENSE, consumedMinor: 600000, recordedByUserId: ACTOR, createdAt: '2026-10-02T00:00:00Z' }] }));
    await expect(handleFinanceBudgetCommand(s, convert())).rejects.toThrow(); expect(s.convertCommitment).not.toHaveBeenCalled();
  });
  it.each(['category', 'resource', 'operational'])('rejects conversion changing the planned %s dimension', async dimension => {
    const s = store(); const e = expense(); e.lines[0] = { ...e.lines[0], ...(dimension === 'category' ? { categoryId: ACTOR } : dimension === 'resource' ? { resourceId: null } : { operational: false }) };
    await expect(handleFinanceBudgetCommand(s, mutation({ type: 'CONVERT_COMMITMENT', id: COMMITMENT, expectedVersion: 1, expenseDraftId: null, expectedDraftVersion: null, expense: e, reason: 'Convertir' }))).rejects.toThrow('dimensión'); expect(s.convertCommitment).not.toHaveBeenCalled();
  });
  it('uses the approved draft snapshot/version and supplies no free-form replacement economy', async () => {
    const s = store(); const d = approvedDraft(); s.draftForConversion.mockResolvedValue(d); const request = mutation({ type: 'CONVERT_COMMITMENT', id: COMMITMENT, expectedVersion: 1, expenseDraftId: DRAFT, expectedDraftVersion: 3, expense: null, reason: 'Convertir aprobado' });
    await handleFinanceBudgetCommand(s, request); expect(s.draftForConversion).toHaveBeenCalledWith(BIZ, DRAFT, 3); expect(s.convertCommitment).toHaveBeenCalledWith(request, expect.objectContaining({ id: COMMITMENT }), { ...d, settlement: null }, d);
  });
  it('rejects stale cancelled commitments before no-op and preserves prior conversions', async () => {
    const s = store(commitment({ version: 2, state: 'CANCELLED' }));
    await expect(handleFinanceBudgetCommand(s, mutation({ type: 'CANCEL_COMMITMENT', id: COMMITMENT, expectedVersion: 1, reason: 'Cancelar' }))).rejects.toThrow('versión'); expect(s.cancelCommitment).not.toHaveBeenCalled();
    await expect(handleFinanceBudgetCommand(s, convert(2))).rejects.toThrow('activo'); expect(s.convertCommitment).not.toHaveBeenCalled();
  });
  it('rejects a foreign-tenant commitment before creating a cost', async () => {
    const s = store(commitment({ businessId: ACTOR })); await expect(handleFinanceBudgetCommand(s, convert())).rejects.toThrow('no disponible'); expect(s.convertCommitment).not.toHaveBeenCalled();
  });
});
describe('Budget/commitment SQL negative controls (port fakes, no PostgreSQL)', () => {
  function sqlStore(tx: SqlFake): { store: FinanceV2BudgetSqlStore; expenses: FinanceV2AtomicExpenseWriter; drafts: FinanceV2DraftSqlStore } { const expenses = new FinanceV2AtomicExpenseWriter(tx, { read: jest.fn() }, new Set()); const drafts = new FinanceV2DraftSqlStore(tx, expenses); return { expenses, drafts, store: new FinanceV2BudgetSqlStore(tx, expenses, drafts) }; }
  it('budget revision CAS failure stops before inserting a new revision or its dimensions', async () => {
    const tx = new SqlFake(); tx.affected = 0; const s = sqlStore(tx).store;
    await expect(s.appendBudgetRevision(mutation({ type: 'CREATE_BUDGET_REVISION', periodMonth: '2026-10', expectedBudgetVersion: 2, lines: [{ categoryId: null, resourceId: null, approvedMinor: 0 }], reason: 'Meta' }), budget())).rejects.toThrow('versión'); expect(tx.writes).toHaveLength(1); expect(tx.writes[0].sql).toContain('version=$3');
  });
  it('commitment cancellation CAS failure neither deletes history nor returns success', async () => {
    const tx = new SqlFake(); tx.affected = 0;
    await expect(sqlStore(tx).store.cancelCommitment(mutation({ type: 'CANCEL_COMMITMENT', id: COMMITMENT, expectedVersion: 1, reason: 'Cancelar' }), commitment())).rejects.toThrow('versión'); expect(tx.writes).toHaveLength(1); expect(tx.writes[0].sql).not.toContain('DELETE');
  });
  it('active policy denies a free-form conversion before Expense or Conversion is written', async () => {
    const tx = new SqlFake([[{ id: REVISION, businessId: BIZ, version: 1, enabled: true, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true }]]);
    await expect(sqlStore(tx).store.convertCommitment(convert(), commitment(), expense(), null)).rejects.toThrow('EXPENSE_APPROVAL_REQUIRED'); expect(tx.writes).toHaveLength(0);
  });
  it('draftForConversion revalidates version, enabled approval policy and reimbursement restrictions', async () => {
    const tx = new SqlFake(); const h = sqlStore(tx); const d = approvedDraft(); jest.spyOn(h.drafts, 'draft').mockResolvedValue(d); jest.spyOn(h.drafts, 'policy').mockResolvedValue({ id: REVISION, businessId: BIZ, version: 1, enabled: true, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true, recordedByUserId: ACTOR, reason: null, createdAt: null });
    await expect(h.store.draftForConversion(BIZ, DRAFT, 2)).rejects.toThrow('versión');
    jest.spyOn(h.drafts, 'draft').mockResolvedValue({ ...d, state: 'SUBMITTED' }); await expect(h.store.draftForConversion(BIZ, DRAFT, 3)).rejects.toThrow('EXPENSE_APPROVAL_REQUIRED');
    jest.spyOn(h.drafts, 'draft').mockResolvedValue({ ...d, reimbursement: { creditorCounterpartyId: ACTOR, supplierCounterpartyId: null, externallyPaidOn: '2026-10-01', privateReference: null } }); await expect(h.store.draftForConversion(BIZ, DRAFT, 3)).rejects.toThrow('reintegro'); expect(tx.writes).toHaveLength(0);
  });
  it('propagates a CAS loss after Expense creation so the outer transaction rolls back', async () => {
    const tx = new SqlFake(); const h = sqlStore(tx); const createExpense = jest.spyOn(h.expenses, 'createExpense').mockResolvedValue({ expenseId: EXPENSE }); tx.affected = 0;
    await expect(h.store.convertCommitment(convert(), commitment(), expense(), null)).rejects.toThrow('versión'); expect(createExpense).toHaveBeenCalledTimes(1); expect(tx.writes[0].sql).toContain('FinanceCommitmentConversion'); expect(tx.writes[1].sql).toContain('version=$3');
  });
});
