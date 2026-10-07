import type { ExpenseDefinition, FinanceApprovalPolicyDto, FinanceExpenseDraftDto, FinanceV2Mutation } from '../domain/finance-v2.types';
import { handleFinanceDraftCommand, type FinanceDraftStore } from './finance-v2-draft.handler';
import { FinanceV2DraftSqlStore } from '../infrastructure/finance-v2-draft.sql-store';
import { FinanceV2AtomicExpenseWriter } from '../infrastructure/finance-v2-expense.writer';
import type { FinanceSqlTransaction } from '../infrastructure/finance-v2.repository';

const BIZ = '00000000-0000-0000-0000-000000000001';
const CREATOR = '00000000-0000-0000-0000-000000000002';
const APPROVER = '00000000-0000-0000-0000-000000000003';
const CATEGORY = '00000000-0000-0000-0000-000000000004';
const DRAFT = '00000000-0000-0000-0000-000000000005';
const POLICY = '00000000-0000-0000-0000-000000000006';
const EXPENSE = '00000000-0000-0000-0000-000000000007';
type DraftStoreMocks = { [K in keyof FinanceDraftStore]: jest.MockedFunction<(...args: Parameters<FinanceDraftStore[K]>) => ReturnType<FinanceDraftStore[K]>> };
function definition(amount = 900000): ExpenseDefinition { return { description: 'Servicio externo', counterpartyId: null, reference: 'Referencia privada', amountMinor: amount, lines: [{ label: 'Servicio', categoryId: CATEGORY, resourceId: null, bookingId: null, amountMinor: amount, operational: true }] }; }
function policy(enabled = false): FinanceApprovalPolicyDto { return { id: enabled ? POLICY : null, businessId: BIZ, version: enabled ? 1 : 0, enabled, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true, recordedByUserId: enabled ? APPROVER : null, reason: null, createdAt: null }; }
function draft(overrides: Partial<FinanceExpenseDraftDto> = {}): FinanceExpenseDraftDto { const expense = definition(); return { ...expense, id: DRAFT, businessId: BIZ, version: 1, state: 'DRAFT', consumedOn: '2026-10-02', dueOn: null, creatorUserId: CREATOR, createdAt: '2026-10-02T00:00:00.000Z', templateId: null, templateRevisionId: null, periodMonth: null, approvalPolicyRevisionId: null, submissionVersion: null, confirmedExpenseId: null, reimbursement: null, decisions: [], lines: expense.lines.map((line, ordinal) => ({ ...line, id: CATEGORY, ordinal, categoryName: 'Servicios', resourceName: null })), ...overrides }; }
function mutation(command: FinanceV2Mutation['command'], actor = CREATOR): FinanceV2Mutation { return { businessId: BIZ, actorUserId: actor, idempotencyKey: 'draft-intent', fingerprint: 'draft-fingerprint', command }; }
function store(current = draft(), currentPolicy = policy()): DraftStoreMocks {
  return { policy: jest.fn().mockResolvedValue(currentPolicy), draft: jest.fn().mockResolvedValue(current), validateDefinition: jest.fn().mockResolvedValue(undefined), createDraft: jest.fn().mockResolvedValue(current), editDraft: jest.fn().mockResolvedValue({ ...current, version: current.version + 1 }), changeDraftState: jest.fn().mockImplementation((_input, source: FinanceExpenseDraftDto, patch) => Promise.resolve({ ...source, ...patch, version: source.version + 1 })), createDecision: jest.fn().mockResolvedValue(undefined), appendPolicy: jest.fn().mockResolvedValue(policy(true)), confirmDraftExpense: jest.fn().mockResolvedValue({ expenseId: EXPENSE }), reimburseExpense: jest.fn().mockResolvedValue({ id: EXPENSE, version: 2, settlementId: CATEGORY }) };
}
class SqlFake implements FinanceSqlTransaction {
  readonly queries: { sql: string; parameters: readonly unknown[] }[] = [];
  readonly writes: { sql: string; parameters: readonly unknown[] }[] = [];
  affected = 1;
  constructor(private readonly replies: object[][]) {}
  query<T extends object>(sql: string, parameters: readonly unknown[]): Promise<T[]> { this.queries.push({ sql, parameters }); return Promise.resolve((this.replies.shift() ?? []) as T[]); }
  execute(sql: string, parameters: readonly unknown[]): Promise<number> { this.writes.push({ sql, parameters }); return Promise.resolve(this.affected); }
}
describe('Finance Draft application approval/version guards', () => {
  it('creates a draft without a monetary fact and validates tenant definition before creating it', async () => {
    const s = store(); const request = mutation({ type: 'CREATE_EXPENSE_DRAFT', expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null });
    await expect(handleFinanceDraftCommand(s, request)).resolves.toMatchObject({ id: DRAFT, version: 1 });
    expect(s.validateDefinition).toHaveBeenCalledWith(BIZ, definition()); expect(s.createDraft).toHaveBeenCalledTimes(1); expect(s.confirmDraftExpense).not.toHaveBeenCalled();
  });
  it.each(['SUBMITTED', 'APPROVED', 'CONFIRMED'] as const)('rejects editing a %s draft before any store mutation', async state => {
    const s = store(draft({ state }));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'EDIT_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, reason: 'Corregir' }))).rejects.toThrow('Retira');
    expect(s.editDraft).not.toHaveBeenCalled(); expect(s.validateDefinition).not.toHaveBeenCalled();
  });
  it('checks stale version before a state/no-op and never confirms a second Expense', async () => {
    const s = store(draft({ state: 'CONFIRMED', version: 3, confirmedExpenseId: EXPENSE }));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 2, settlement: null, reason: 'Confirmar' }))).rejects.toThrow('versión');
    expect(s.policy).not.toHaveBeenCalled(); expect(s.confirmDraftExpense).not.toHaveBeenCalled();
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 3, settlement: null, reason: 'Confirmar' }))).rejects.toThrow('ya tiene');
  });
  it('rejects a foreign-tenant draft returned by a port', async () => {
    const s = store(draft({ businessId: APPROVER }));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'WITHDRAW_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, reason: 'Retirar' }))).rejects.toThrow('no disponible');
    expect(s.changeDraftState).not.toHaveBeenCalled();
  });
  it('submits against the current policy version and preserves its immutable ID/submission version', async () => {
    const s = store(draft(), policy(true)); const request = mutation({ type: 'SUBMIT_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, expectedPolicyVersion: 1, reason: 'Revisar' });
    await handleFinanceDraftCommand(s, request);
    expect(s.changeDraftState).toHaveBeenCalledWith(request, expect.objectContaining({ id: DRAFT }), { state: 'SUBMITTED', approvalPolicyRevisionId: POLICY, submissionVersion: 2 });
    s.changeDraftState.mockClear();
    await expect(handleFinanceDraftCommand(s, mutation({ ...request.command, expectedPolicyVersion: 0 } as Extract<FinanceV2Mutation['command'], { type: 'SUBMIT_EXPENSE_DRAFT' }>))).rejects.toThrow('versión');
    expect(s.changeDraftState).not.toHaveBeenCalled();
  });
  it('requires a different approval actor and a submitted snapshot tied to the exact policy revision', async () => {
    const current = draft({ state: 'SUBMITTED', version: 2, approvalPolicyRevisionId: POLICY, submissionVersion: 2 }); const s = store(current, policy(true));
    const command = { type: 'DECIDE_EXPENSE_DRAFT' as const, id: DRAFT, expectedVersion: 2, policyRevisionId: POLICY, decision: 'APPROVE' as const, reason: 'Aprobar' };
    await expect(handleFinanceDraftCommand(s, mutation(command))).rejects.toThrow('otro actor'); expect(s.createDecision).not.toHaveBeenCalled();
    await expect(handleFinanceDraftCommand(s, mutation(command, APPROVER))).resolves.toMatchObject({ version: 3 });
    expect(s.policy).toHaveBeenLastCalledWith(BIZ, POLICY); expect(s.createDecision).toHaveBeenCalledWith(expect.objectContaining({ actorUserId: APPROVER }), current, 'APPROVE', 'Aprobar');
  });
  it.each(['DRAFT', 'SUBMITTED'] as const)('enabled approval prevents confirming %s', async state => {
    const s = store(draft({ state, approvalPolicyRevisionId: POLICY, submissionVersion: state === 'DRAFT' ? null : 1 }), policy(true));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, settlement: null, reason: 'Confirmar' }))).rejects.toThrow('EXPENSE_APPROVAL_REQUIRED');
    expect(s.confirmDraftExpense).not.toHaveBeenCalled();
  });
  it('confirms the approved stored definition and its submission policy instead of a changed current policy', async () => {
    const current = draft({ state: 'APPROVED', version: 3, submissionVersion: 2, approvalPolicyRevisionId: POLICY }); const s = store(current, policy(true));
    const request = mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 3, settlement: null, reason: 'Confirmar aprobado' });
    const result = await handleFinanceDraftCommand(s, request);
    expect(s.policy).toHaveBeenCalledWith(BIZ, POLICY); expect(s.confirmDraftExpense).toHaveBeenCalledWith(request, current, null);
    expect(s.changeDraftState).toHaveBeenCalledWith(request, current, { state: 'CONFIRMED', confirmedExpenseId: EXPENSE }); expect(result.relatedIds?.expenseId).toBe(EXPENSE);
  });
  it('uses the explicit disabled submission snapshot even after a policy is later enabled', async () => {
    const current = draft({ state: 'SUBMITTED', version: 2, submissionVersion: 2, approvalPolicyRevisionId: null }); const s = store(current);
    s.policy.mockImplementation((_biz, revisionId) => Promise.resolve(revisionId === null ? policy() : policy(true)));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 2, settlement: null, reason: 'Confirmar histórico' }))).resolves.toMatchObject({ version: 3 });
    expect(s.policy).toHaveBeenCalledWith(BIZ, null);
  });
  it('withdraws approval explicitly before editing and clears submission policy', async () => {
    const current = draft({ state: 'APPROVED', version: 3, submissionVersion: 2, approvalPolicyRevisionId: POLICY }); const s = store(current, policy(true)); const request = mutation({ type: 'WITHDRAW_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 3, reason: 'Cambiar datos' });
    await handleFinanceDraftCommand(s, request); expect(s.changeDraftState).toHaveBeenCalledWith(request, current, { state: 'DRAFT', approvalPolicyRevisionId: null, submissionVersion: null });
  });
  it('prevents supplier/employee creditor changes and a reimbursement from using own cash at confirmation', async () => {
    const s = store(); const command = { type: 'CREATE_REIMBURSEMENT_DRAFT' as const, expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, creditorCounterpartyId: CREATOR, supplierCounterpartyId: null, externallyPaidOn: '2026-10-01', privateReference: null };
    await expect(handleFinanceDraftCommand(s, mutation(command))).rejects.toThrow('acreedor'); expect(s.createDraft).not.toHaveBeenCalled();
    s.draft.mockResolvedValue(draft({ reimbursement: { creditorCounterpartyId: CREATOR, supplierCounterpartyId: null, externallyPaidOn: '2026-10-01', privateReference: null } }));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'CONFIRM_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, settlement: { accountId: CATEGORY, amountMinor: 900000, occurredAt: '2026-10-02T00:00:00Z', reference: null }, reason: 'Confirmar' }))).rejects.toThrow('caja propia'); expect(s.confirmDraftExpense).not.toHaveBeenCalled();
  });
  it('refuses stale policy updates before appending a policy revision', async () => {
    const s = store(draft(), policy(true));
    await expect(handleFinanceDraftCommand(s, mutation({ type: 'SET_EXPENSE_APPROVAL_POLICY', expectedPolicyVersion: 0, enabled: false, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true, reason: 'Deshabilitar' }))).rejects.toThrow('versión'); expect(s.appendPolicy).not.toHaveBeenCalled();
  });
});
describe('Draft and atomic SQL negative controls (no PostgreSQL)', () => {
  it('absent policy permits direct Expense once while enabled policy denies a CSV/import bypass before any writes', async () => {
    const request = mutation({ type: 'CONFIRM_HISTORY_IMPORT', sourceNamespace: 'own', csv: 'validated by caller', previewToken: 'token', reason: 'Historia' });
    const params = { expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, settlement: null };
    const enabled = new SqlFake([[{ ...policy(true), createdAt: new Date('2026-10-02Z') }]]);
    await expect(new FinanceV2AtomicExpenseWriter(enabled, { read: jest.fn() }, new Set()).createExpense(request, params)).rejects.toThrow('EXPENSE_APPROVAL_REQUIRED'); expect(enabled.writes).toHaveLength(0);
    const disabled = new SqlFake([[], [{ id: CATEGORY }]]);
    await expect(new FinanceV2AtomicExpenseWriter(disabled, { read: jest.fn() }, new Set()).createExpense(request, params)).resolves.toHaveProperty('expenseId');
    expect(disabled.writes.map(write => write.sql.match(/INSERT INTO "(\w+)"/)?.[1])).toEqual(['FinanceExpense', 'FinanceExpenseLine']);
  });
  it('enabled policy also denies a bank fee direct Expense entrypoint before any writes', async () => {
    const tx = new SqlFake([[{ ...policy(true), createdAt: new Date('2026-10-02Z') }]]);
    const request = mutation({ type: 'CONFIRM_BANK_MATCH', accountId: CATEGORY, rows: [], components: [], paymentLinks: [], fees: [], previewToken: 'token', reason: 'Fee' });
    await expect(new FinanceV2AtomicExpenseWriter(tx, { read: jest.fn() }, new Set()).createExpense(request, { expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, settlement: null })).rejects.toThrow('EXPENSE_APPROVAL_REQUIRED'); expect(tx.writes).toHaveLength(0);
  });
  it('explicit disabled policy snapshot does not accidentally read a later enabled policy', async () => {
    const tx = new SqlFake([[{ ...policy(true), createdAt: new Date() }]]); const expenses = new FinanceV2AtomicExpenseWriter(tx, { read: jest.fn() }, new Set());
    expect(await new FinanceV2DraftSqlStore(tx, expenses).policy(BIZ, null)).toMatchObject({ enabled: false, id: null, version: 0 }); expect(tx.queries).toHaveLength(0);
  });
  it('failed draft CAS stops before appending replacement lines', async () => {
    const tx = new SqlFake([[{ definitionVersion: 1 }]]); tx.affected = 0; const expenses = new FinanceV2AtomicExpenseWriter(tx, { read: jest.fn() }, new Set());
    const s = new FinanceV2DraftSqlStore(tx, expenses);
    await expect(s.editDraft(mutation({ type: 'EDIT_EXPENSE_DRAFT', id: DRAFT, expectedVersion: 1, expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, reason: 'Editar' }), draft(), { expenseDefinition: definition(), consumedOn: '2026-10-02', dueOn: null, reimbursement: null })).rejects.toThrow('versión');
    expect(tx.writes).toHaveLength(1); expect(tx.writes[0].sql).toContain('version=$3'); expect(tx.writes.some(write => write.sql.includes('INSERT'))).toBe(false);
  });
});
