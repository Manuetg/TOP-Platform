import { randomUUID } from 'node:crypto';
import type { ExpenseDefinition, FinanceV2Mutation, SettlementInputV2, FinanceReimbursementDto, FinanceExpenseDraftDto, FinanceApprovalPolicyDto } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { safeMoney, sumMoney } from '../domain/finance-money';
import { parseFinanceCommand } from '../domain/finance-validation';
import { validateExpenseDefinition } from '../application/finance-v2-draft.handler';
import { requireExactVersion, requireExpenseConfirmation } from '../application/finance-v2-policy.rules';
import type { FinanceSqlTransaction } from './finance-v2.repository';

export interface BookingCostReference {
  id: string; resourceId: string | null; updatedAt: string; status: string;
}
export interface BookingCostReferenceReader {
  read(tx: FinanceSqlTransaction, businessId: string, bookingId: string): Promise<BookingCostReference | null>;
}
export interface AtomicExpenseInput {
  expenseDefinition: ExpenseDefinition; consumedOn: string; dueOn: string | null;
  settlement: SettlementInputV2 | null; reimbursement?: FinanceReimbursementDto | null;
  approvedDraft?: FinanceExpenseDraftDto | null; historical?: { includedInOpening: boolean };
}

export class FinanceV2AtomicExpenseWriter {
  constructor(private readonly tx: FinanceSqlTransaction, private readonly bookingReader: BookingCostReferenceReader, private readonly lockedBookingIds: ReadonlySet<string>) {}

  async validateDefinition(businessId: string, definition: ExpenseDefinition): Promise<Map<string, BookingCostReference>> {
    validateExpenseDefinition(definition);
    const categoryIds = [...new Set(definition.lines.map(line => line.categoryId))];
    const categories = await this.tx.query<{ id: string }>('SELECT id FROM "FinanceCatalog" WHERE "businessId"=$1 AND kind=\'CATEGORY\' AND archived=false AND id=ANY($2::text[])', [businessId, categoryIds]);
    if (categories.length !== categoryIds.length) throw new FinanceNotFoundError('Categoría no disponible.');
    if (definition.counterpartyId !== null) {
      const counterparties = await this.tx.query<{ id: string }>('SELECT id FROM "FinanceCatalog" WHERE "businessId"=$1 AND kind=\'COUNTERPARTY\' AND archived=false AND id=$2', [businessId, definition.counterpartyId]);
      if (!counterparties.length) throw new FinanceNotFoundError('Contraparte no disponible.');
    }
    const resourceIds = [...new Set(definition.lines.flatMap(line => line.resourceId === null ? [] : [line.resourceId]))];
    const resources = resourceIds.length ? await this.tx.query<{ id: string }>('SELECT id FROM "Resource" WHERE "businessId"=$1 AND id=ANY($2::text[])', [businessId, resourceIds]) : [];
    if (resources.length !== resourceIds.length) throw new FinanceNotFoundError('Recurso no disponible.');
    return this.bookingReferences(businessId,definition);
  }

  private async bookingReferences(businessId:string,definition:ExpenseDefinition):Promise<Map<string,BookingCostReference>>{
    const bookings = new Map<string, BookingCostReference>();
    for (const line of definition.lines) {
      if (line.bookingId === null) continue;
      if (!this.lockedBookingIds.has(line.bookingId)) throw new FinanceConflictError('Las referencias de reserva cambiaron; actualiza la intención.');
      const source = bookings.get(line.bookingId) ?? await this.bookingReader.read(this.tx, businessId, line.bookingId);
      if (!source || source.resourceId !== line.resourceId) throw new FinanceNotFoundError('Reserva o asociación de recurso no disponible.');
      bookings.set(line.bookingId, source);
    }
    return bookings;
  }

  async createExpense(input: FinanceV2Mutation, expense: AtomicExpenseInput): Promise<{ expenseId: string; settlementId?: string; claimId?: string }> {
    const policy = await this.expensePolicy(input.businessId, expense.approvedDraft);
    requireExpenseConfirmation(policy, expense.approvedDraft ?? null);
    const bookings = await this.validateDefinition(input.businessId, expense.expenseDefinition);
    const expenseId = randomUUID();
    const definition = expense.expenseDefinition;
    if (expense.reimbursement && expense.reimbursement.creditorCounterpartyId !== definition.counterpartyId) throw new FinanceInputError('El acreedor del reintegro debe coincidir con el gasto.');
    await this.tx.execute('INSERT INTO "FinanceExpense" (id,"businessId",description,"consumedOn","dueOn","counterpartyId",reference,"amountMinor",version,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4::date,$5::date,$6,$7,$8,1,$9,CURRENT_TIMESTAMP)', [expenseId, input.businessId, definition.description, expense.consumedOn, expense.dueOn, definition.counterpartyId, definition.reference, BigInt(definition.amountMinor), input.actorUserId]);
    await this.appendExpenseLines(input,expenseId,definition,bookings);
    const claimId = expense.reimbursement ? await this.createClaim(input, expenseId, expense.reimbursement) : undefined;
    if (claimId && expense.settlement !== null) throw new FinanceInputError('El pago anterior del empleado no registra salida de caja propia.');
    const settlementId = expense.settlement ? await this.settlement(input, expenseId, 1, expense.settlement, expense.historical, false) : undefined;
    return { expenseId, settlementId, claimId };
  }

  private async appendExpenseLines(input:FinanceV2Mutation,expenseId:string,definition:ExpenseDefinition,bookings:ReadonlyMap<string,BookingCostReference>):Promise<void>{
    for (const line of definition.lines) {
      const booking = line.bookingId === null ? null : bookings.get(line.bookingId)!;
      await this.tx.execute('INSERT INTO "FinanceExpenseLine" (id,"businessId","expenseId",label,"categoryId","resourceId","bookingId","bookingSourceUpdatedAt","bookingSourceStatus","amountMinor",operational) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::timestamp,$9::"BookingStatus",$10,$11)', [randomUUID(), input.businessId, expenseId, line.label, line.categoryId, line.resourceId, line.bookingId, booking?.updatedAt ?? null, booking?.status ?? null, BigInt(line.amountMinor), line.operational]);
    }
  }

  async settlement(input: FinanceV2Mutation, expenseId: string, expectedVersion: number, settlement: SettlementInputV2, historical?: { includedInOpening: boolean }, incrementVersion = true): Promise<string> {
    const parsed = parseFinanceCommand({ type: 'SETTLE_EXPENSE', id: expenseId, expectedVersion, settlement });
    if (parsed.type !== 'SETTLE_EXPENSE') throw new FinanceInputError('Liquidación inválida.');
    await this.requireSettlementExpense(input.businessId,expenseId,expectedVersion,parsed.settlement.amountMinor);
    const occurred=await this.requireSettlementAccount(input,parsed.settlement,historical);
    const id = randomUUID();
    await this.tx.execute('INSERT INTO "FinanceSettlement" (id,"businessId","expenseId","accountId","amountMinor","occurredAt",reference,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6::timestamp,$7,$8,CURRENT_TIMESTAMP)', [id, input.businessId, expenseId, parsed.settlement.accountId, BigInt(parsed.settlement.amountMinor), occurred.toISOString(), parsed.settlement.reference, input.actorUserId]);
    if (incrementVersion && await this.tx.execute('UPDATE "FinanceExpense" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3', [input.businessId, expenseId, expectedVersion]) !== 1) throw new FinanceConflictError('La versión del gasto cambió.');
    return id;
  }

  private async requireSettlementExpense(businessId:string,expenseId:string,expectedVersion:number,amountMinor:number):Promise<void>{
    const rows = await this.tx.query<{ amountMinor: bigint; version: number }>('SELECT "amountMinor",version FROM "FinanceExpense" WHERE "businessId"=$1 AND id=$2', [businessId, expenseId]);
    if (!rows[0]) throw new FinanceNotFoundError('Gasto no disponible.');
    requireExactVersion(rows[0].version, expectedVersion);
    const sums = await this.tx.query<{ paid: string }>('SELECT COALESCE(SUM("amountMinor"),0)::text AS paid FROM "FinanceSettlement" WHERE "businessId"=$1 AND "expenseId"=$2', [businessId, expenseId]);
    if (sumMoney([safeMoney(BigInt(sums[0]?.paid ?? '0')), amountMinor]) > safeMoney(rows[0].amountMinor)) throw new FinanceConflictError('La liquidación supera la obligación pendiente.');
  }

  private async requireSettlementAccount(input:FinanceV2Mutation,settlement:SettlementInputV2,historical:{includedInOpening:boolean}|undefined):Promise<Date>{
    const account = await this.tx.query<{ archived: boolean; occurredAt: Date | null }>('SELECT a.archived,o."occurredAt" FROM "FinanceAccount" a LEFT JOIN "FinanceOpening" o ON o."accountId"=a.id AND o."businessId"=a."businessId" WHERE a."businessId"=$1 AND a.id=$2', [input.businessId, settlement.accountId]);
    if (!account[0]) throw new FinanceNotFoundError('Cuenta no disponible.');
    if (account[0].archived || account[0].occurredAt === null) throw new FinanceConflictError('La cuenta requiere apertura vigente.');
    const occurred = new Date(settlement.occurredAt);
    if (occurred.getTime() > Date.now()) throw new FinanceInputError('El pago no puede tener fecha futura.');
    if (occurred < account[0].occurredAt && !includedHistorySettlement(input,historical)) throw new FinanceInputError('El movimiento es anterior al corte de apertura.');
    return occurred;
  }

  async reimburse(input: FinanceV2Mutation, expenseId: string, expectedVersion: number, settlement: SettlementInputV2): Promise<{ id: string; version: number; settlementId: string }> {
    const claims = await this.tx.query<{ id: string }>('SELECT id FROM "FinanceReimbursementClaim" WHERE "businessId"=$1 AND "expenseId"=$2', [input.businessId, expenseId]);
    if (!claims.length) throw new FinanceNotFoundError('Obligación de reintegro no disponible.');
    const settlementId = await this.settlement(input, expenseId, expectedVersion, settlement);
    return { id: expenseId, version: expectedVersion + 1, settlementId };
  }

  private async createClaim(input: FinanceV2Mutation, expenseId: string, claim: FinanceReimbursementDto): Promise<string> {
    const ids = [...new Set([claim.creditorCounterpartyId,claim.supplierCounterpartyId].filter((id): id is string => id !== null))];
    const sources = await this.tx.query<{ id: string }>('SELECT id FROM "FinanceCatalog" WHERE "businessId"=$1 AND kind=\'COUNTERPARTY\' AND archived=false AND id=ANY($2::text[])',[input.businessId,ids]);
    if (sources.length !== ids.length) throw new FinanceNotFoundError('Contraparte de reintegro no disponible.');
    const id = randomUUID();
    await this.tx.execute('INSERT INTO "FinanceReimbursementClaim" (id,"businessId","expenseId","creditorCounterpartyId","supplierCounterpartyId","externallyPaidOn","privateReference","recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5,$6::date,$7,$8,CURRENT_TIMESTAMP)', [id, input.businessId, expenseId, claim.creditorCounterpartyId, claim.supplierCounterpartyId, claim.externallyPaidOn, claim.privateReference, input.actorUserId]);
    return id;
  }

  private async expensePolicy(businessId: string, draft: FinanceExpenseDraftDto | null | undefined): Promise<FinanceApprovalPolicyDto> {
    const disabled = { id: null, businessId, version: 0, enabled: false, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS' as const, requireDifferentActor: true as const, recordedByUserId: null, reason: null, createdAt: null };
    if (draft && draft.submissionVersion !== null && draft.approvalPolicyRevisionId === null) return disabled;
    const rows = draft?.approvalPolicyRevisionId ? await this.tx.query<FinanceApprovalPolicyDto>('SELECT * FROM "FinanceApprovalPolicyRevision" WHERE "businessId"=$1 AND id=$2', [businessId, draft.approvalPolicyRevisionId]) : await this.tx.query<FinanceApprovalPolicyDto>('SELECT * FROM "FinanceApprovalPolicyRevision" WHERE "businessId"=$1 ORDER BY version DESC LIMIT 1', [businessId]);
    if (draft?.approvalPolicyRevisionId && !rows[0]) throw new FinanceNotFoundError('Política de aprobación no disponible.');
    return rows[0] ?? disabled;
  }
}

function includedHistorySettlement(input:FinanceV2Mutation,historical:{includedInOpening:boolean}|undefined):boolean{
  return input.command.type==='CONFIRM_HISTORY_IMPORT'&&historical?.includedInOpening===true;
}
