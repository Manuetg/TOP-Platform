import { randomUUID } from 'node:crypto';
import type { FinanceApprovalPolicyDto, FinanceExpenseDraftDto, FinanceExpenseDraftLineDto, FinanceDraftDecisionDto, FinanceReimbursementDto, FinanceV2Mutation, SettlementInputV2 } from '../domain/finance-v2.types';
import { handleFinanceDraftCommand, type FinanceDraftStore, type DraftWriteInput, type DraftStatePatch } from '../application/finance-v2-draft.handler';
import { FinanceConflictError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney } from '../domain/finance-money';
import type { FinanceSqlTransaction, FinanceV2CommandHandler } from './finance-v2.repository';
import { FinanceV2AtomicExpenseWriter, BookingCostReferenceReader } from './finance-v2-expense.writer';

export const sqlDate = (value: Date | string): string => typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export const sqlInstant = (value: Date | string): string => typeof value === 'string' ? new Date(value).toISOString() : value.toISOString();
export async function requireUpdated(tx: FinanceSqlTransaction, sql: string, parameters: readonly unknown[]): Promise<void> {
  if (await tx.execute(sql, parameters) !== 1) throw new FinanceConflictError('La versión cambió; actualiza antes de continuar.');
}

type DraftRow = Omit<FinanceExpenseDraftDto, 'lines' | 'decisions' | 'reimbursement' | 'amountMinor' | 'createdAt' | 'consumedOn' | 'dueOn'> & { amountMinor: bigint; definitionVersion: number; createdAt: Date; consumedOn: Date; dueOn: Date | null };
type DraftLineRow = Omit<FinanceExpenseDraftLineDto, 'amountMinor'> & { amountMinor: bigint };
type DecisionRow = Omit<FinanceDraftDecisionDto, 'occurredAt'> & { occurredAt: Date };

export class FinanceV2DraftSqlStore implements FinanceDraftStore {
  constructor(private readonly tx: FinanceSqlTransaction, readonly expenses: FinanceV2AtomicExpenseWriter) {}

  async policy(businessId: string, revisionId?: string | null): Promise<FinanceApprovalPolicyDto> {
    const disabled: FinanceApprovalPolicyDto = { id: null, businessId, version: 0, enabled: false, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true, recordedByUserId: null, reason: null, createdAt: null };
    if (revisionId === null) return disabled;
    const rows = await this.tx.query<FinanceApprovalPolicyDto & { createdAt: Date }>(revisionId === undefined ? 'SELECT * FROM "FinanceApprovalPolicyRevision" WHERE "businessId"=$1 ORDER BY version DESC LIMIT 1' : 'SELECT * FROM "FinanceApprovalPolicyRevision" WHERE "businessId"=$1 AND id=$2', revisionId === undefined ? [businessId] : [businessId, revisionId]);
    if (revisionId && !rows[0]) throw new FinanceNotFoundError('Política de aprobación no disponible.');
    return rows[0] ? { ...rows[0], createdAt: sqlInstant(rows[0].createdAt) } : disabled;
  }

  async draft(businessId: string, id: string): Promise<FinanceExpenseDraftDto | null> {
    const rows = await this.tx.query<DraftRow>('SELECT * FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND id=$2', [businessId, id]);
    const row = rows[0];
    if (!row) return null;
    const lines = await this.tx.query<DraftLineRow>('SELECT l.*,c.name AS "categoryName",r.name AS "resourceName" FROM "FinanceExpenseDraftLine" l JOIN "FinanceCatalog" c ON c.id=l."categoryId" AND c."businessId"=l."businessId" LEFT JOIN "Resource" r ON r.id=l."resourceId" AND r."businessId"=l."businessId" WHERE l."businessId"=$1 AND l."draftId"=$2 AND l."definitionVersion"=$3 ORDER BY l.ordinal', [businessId, id, row.definitionVersion]);
    const decisions = await this.tx.query<DecisionRow>('SELECT * FROM "FinanceDraftDecision" WHERE "businessId"=$1 AND "draftId"=$2 ORDER BY "occurredAt",id', [businessId, id]);
    const claims = await this.tx.query<FinanceReimbursementDto & { externallyPaidOn: Date }>('SELECT "creditorCounterpartyId","supplierCounterpartyId","externallyPaidOn","privateReference" FROM "FinanceReimbursementDraft" WHERE "businessId"=$1 AND "draftId"=$2', [businessId, id]);
    return { ...row, amountMinor: safeMoney(row.amountMinor), createdAt: sqlInstant(row.createdAt), consumedOn: sqlDate(row.consumedOn), dueOn: row.dueOn === null ? null : sqlDate(row.dueOn), lines: lines.map(line => ({ ...line, amountMinor: safeMoney(line.amountMinor) })), decisions: decisions.map(decision => ({ ...decision, occurredAt: sqlInstant(decision.occurredAt) })), reimbursement: claims[0] ? { ...claims[0], externallyPaidOn: sqlDate(claims[0].externallyPaidOn) } : null };
  }

  async validateDefinition(businessId: string, definition: DraftWriteInput['expenseDefinition']): Promise<void> { await this.expenses.validateDefinition(businessId, definition); }

  async createDraft(input: FinanceV2Mutation, definition: DraftWriteInput): Promise<FinanceExpenseDraftDto> {
    const id = randomUUID();
    const d = definition.expenseDefinition;
    await this.tx.execute('INSERT INTO "FinanceExpenseDraft" (id,"businessId",description,"consumedOn","dueOn","counterpartyId",reference,"amountMinor",version,"definitionVersion",state,"creatorUserId","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,1,1,\'DRAFT\',$9,$9,CURRENT_TIMESTAMP)', [id, input.businessId, d.description, definition.consumedOn, definition.dueOn, d.counterpartyId, d.reference, BigInt(d.amountMinor), input.actorUserId]);
    await this.appendLines(input.businessId, id, 1, d);
    if (definition.reimbursement) {
      const claim = definition.reimbursement;
      await this.validateClaim(input.businessId, claim);
      await this.tx.execute('INSERT INTO "FinanceReimbursementDraft" (id,"businessId","draftId","creditorCounterpartyId","supplierCounterpartyId","externallyPaidOn","privateReference","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, id, claim.creditorCounterpartyId, claim.supplierCounterpartyId, claim.externallyPaidOn, claim.privateReference, input.actorUserId]);
    }
    return (await this.draft(input.businessId, id))!;
  }

  async editDraft(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, definition: DraftWriteInput): Promise<FinanceExpenseDraftDto> {
    const rows = await this.tx.query<{ definitionVersion: number }>('SELECT "definitionVersion" FROM "FinanceExpenseDraft" WHERE "businessId"=$1 AND id=$2', [input.businessId, draft.id]);
    if (!rows[0]) throw new FinanceNotFoundError('Borrador no disponible.');
    const next = rows[0].definitionVersion + 1;
    const d = definition.expenseDefinition;
    await requireUpdated(this.tx, 'UPDATE "FinanceExpenseDraft" SET description=$4,"consumedOn"=$5::date,"dueOn"=$6::date,"counterpartyId"=$7,reference=$8,"amountMinor"=$9,"definitionVersion"=$10,version=version+1,state=\'DRAFT\',"approvalPolicyRevisionId"=NULL,"submissionVersion"=NULL WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, draft.id, draft.version, d.description, definition.consumedOn, definition.dueOn, d.counterpartyId, d.reference, BigInt(d.amountMinor), next]);
    await this.appendLines(input.businessId, draft.id, next, d);
    return (await this.draft(input.businessId, draft.id))!;
  }

  async changeDraftState(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, patch: DraftStatePatch): Promise<FinanceExpenseDraftDto> {
    await requireUpdated(this.tx, 'UPDATE "FinanceExpenseDraft" SET state=$4::"FinanceExpenseDraftState",version=version+1,"approvalPolicyRevisionId"=$5,"submissionVersion"=$6,"confirmedExpenseId"=$7 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, draft.id, draft.version, patch.state, patch.approvalPolicyRevisionId === undefined ? draft.approvalPolicyRevisionId : patch.approvalPolicyRevisionId, patch.submissionVersion === undefined ? draft.submissionVersion : patch.submissionVersion, patch.confirmedExpenseId === undefined ? draft.confirmedExpenseId : patch.confirmedExpenseId]);
    return (await this.draft(input.businessId, draft.id))!;
  }

  async createDecision(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, decision: 'APPROVE' | 'REJECT', reason: string): Promise<void> {
    await this.tx.execute('INSERT INTO "FinanceDraftDecision" (id,"businessId","draftId","draftVersionAtSubmission","policyRevisionId",decision,"actorUserId",reason,"occurredAt","createdAt") VALUES ($1,$2,$3,$4,$5,$6::"FinanceDraftDecisionKind",$7,$8,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)', [randomUUID(), input.businessId, draft.id, draft.submissionVersion, draft.approvalPolicyRevisionId, decision, input.actorUserId, reason]);
  }

  async appendPolicy(input: FinanceV2Mutation, nextVersion: number): Promise<FinanceApprovalPolicyDto> {
    if (input.command.type !== 'SET_EXPENSE_APPROVAL_POLICY') throw new FinanceConflictError('Intención de política inválida.');
    const c = input.command; const id = randomUUID();
    await this.tx.execute('INSERT INTO "FinanceApprovalPolicyRevision" (id,"businessId",version,enabled,scope,"requireDifferentActor",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,true,$6,$7,CURRENT_TIMESTAMP)', [id, input.businessId, nextVersion, c.enabled, c.scope, c.reason, input.actorUserId]);
    return this.policy(input.businessId, id);
  }

  async confirmDraftExpense(input: FinanceV2Mutation, draft: FinanceExpenseDraftDto, settlement: SettlementInputV2 | null): Promise<{ expenseId: string; claimId?: string }> {
    return this.expenses.createExpense(input, { expenseDefinition: draft, consumedOn: draft.consumedOn, dueOn: draft.dueOn, settlement, approvedDraft: draft, reimbursement: draft.reimbursement });
  }
  reimburseExpense(input: FinanceV2Mutation, expenseId: string, expectedVersion: number, settlement: SettlementInputV2): Promise<{id:string;version:number;settlementId:string}> { return this.expenses.reimburse(input, expenseId, expectedVersion, settlement); }

  async appendLines(businessId: string, draftId: string, definitionVersion: number, definition: DraftWriteInput['expenseDefinition']): Promise<void> {
    const bookings = await this.expenses.validateDefinition(businessId, definition);
    for (let ordinal = 0; ordinal < definition.lines.length; ordinal++) {
      const line = definition.lines[ordinal]; const booking = line.bookingId ? bookings.get(line.bookingId) : null;
      await this.tx.execute('INSERT INTO "FinanceExpenseDraftLine" (id,"businessId","draftId","definitionVersion",ordinal,label,"categoryId","resourceId","bookingId","bookingSourceUpdatedAt","bookingSourceStatus","amountMinor",operational,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamp,$11::"BookingStatus",$12,$13,CURRENT_TIMESTAMP)', [randomUUID(), businessId, draftId, definitionVersion, ordinal, line.label, line.categoryId, line.resourceId, line.bookingId, booking?.updatedAt ?? null, booking?.status ?? null, BigInt(line.amountMinor), line.operational]);
    }
  }

  private async validateClaim(businessId: string, claim: FinanceReimbursementDto): Promise<void> {
    const ids = [...new Set([claim.creditorCounterpartyId, claim.supplierCounterpartyId].filter((id): id is string => id !== null))];
    const rows = await this.tx.query<{ id: string }>('SELECT id FROM "FinanceCatalog" WHERE "businessId"=$1 AND kind=\'COUNTERPARTY\' AND archived=false AND id=ANY($2::text[])', [businessId, ids]);
    if (rows.length !== ids.length) throw new FinanceNotFoundError('Contraparte de reintegro no disponible.');
  }
}

export class FinanceV2DraftCommandHandler implements FinanceV2CommandHandler {
  readonly commandTypes = ['CREATE_EXPENSE_DRAFT','CREATE_REIMBURSEMENT_DRAFT','EDIT_EXPENSE_DRAFT','SUBMIT_EXPENSE_DRAFT','WITHDRAW_EXPENSE_DRAFT','DECIDE_EXPENSE_DRAFT','CONFIRM_EXPENSE_DRAFT','SET_EXPENSE_APPROVAL_POLICY','REIMBURSE_EXPENSE'] as const;
  constructor(private readonly bookingReader: BookingCostReferenceReader) {}
  async bookingReferences(tx: FinanceSqlTransaction, input: FinanceV2Mutation): Promise<readonly string[]> {
    const c = input.command;
    if ('expenseDefinition' in c) return c.expenseDefinition.lines.flatMap(line => line.bookingId ? [line.bookingId] : []);
    if (c.type !== 'CONFIRM_EXPENSE_DRAFT') return [];
    const rows = await tx.query<{ bookingId: string }>('SELECT l."bookingId" FROM "FinanceExpenseDraftLine" l JOIN "FinanceExpenseDraft" d ON d.id=l."draftId" AND d."businessId"=l."businessId" AND d."definitionVersion"=l."definitionVersion" WHERE l."businessId"=$1 AND d.id=$2 AND l."bookingId" IS NOT NULL', [input.businessId, c.id]);
    return rows.map(row => row.bookingId);
  }
  execute(tx: FinanceSqlTransaction, input: FinanceV2Mutation, lockedBookingIds: ReadonlySet<string>): ReturnType<typeof handleFinanceDraftCommand> { return handleFinanceDraftCommand(new FinanceV2DraftSqlStore(tx, new FinanceV2AtomicExpenseWriter(tx, this.bookingReader, lockedBookingIds)), input); }
}
