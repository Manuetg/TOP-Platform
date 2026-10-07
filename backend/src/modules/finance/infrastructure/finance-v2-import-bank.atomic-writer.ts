import { randomUUID } from 'node:crypto';
import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import { FinanceConflictError, FinanceInputError, FinanceNotFoundError } from '../domain/finance.errors';
import { requireExactVersion } from '../application/finance-v2-policy.rules';
import type { HistoryOpening, HistoryExpense, HistorySettlement } from '../application/finance-v2-import.types';
import type { BankPaymentLinkInput, BankFeePlan, BankSourceSnapshot } from '../application/finance-v2-bank.types';
import type { FinanceSqlTransaction } from './finance-v2.repository';
import type { FinanceImportBankAtomicWriter } from './finance-v2-import-bank.ports';
import type { FinanceBankPublicSourceReader } from './finance-v2-bank.read-service';
import { FinanceV2AtomicExpenseWriter, BookingCostReferenceReader } from './finance-v2-expense.writer';
import { requireUpdated } from './finance-v2-draft.sql-store';

interface PaymentLinkAccount {archived:boolean;currency:string;openingId:string|null}
function requireEligiblePayment(source:BankSourceSnapshot|undefined):void{
  if (!source || !source.eligible || source.currency !== 'PYG') throw new FinanceNotFoundError('Cobro no disponible.');
}
function requirePaymentLinkAccount(account:PaymentLinkAccount|undefined):void{
  if (!account || account.archived || account.currency !== 'PYG' || account.openingId === null) throw new FinanceConflictError('Cuenta propia con apertura requerida.');
}

export class FinanceImportBankSqlAtomicWriter implements FinanceImportBankAtomicWriter {
  constructor(private readonly bookings: BookingCostReferenceReader, private readonly sources: FinanceBankPublicSourceReader, private readonly lockedBookingIds: ReadonlySet<string> = new Set()) {}
  withBookingLocks(lockedBookingIds: ReadonlySet<string>): FinanceImportBankAtomicWriter { return new FinanceImportBankSqlAtomicWriter(this.bookings, this.sources, lockedBookingIds); }
  async opening(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistoryOpening): Promise<{ id: string }> {
    const accounts = await tx.query<{ archived: boolean; currency: string; version: number; openingId: string | null }>('SELECT a.archived,b.currency,a.version,o.id AS "openingId" FROM "FinanceAccount" a JOIN "Business" b ON b.id=a."businessId" LEFT JOIN "FinanceOpening" o ON o."accountId"=a.id AND o."businessId"=a."businessId" WHERE a."businessId"=$1 AND a.id=$2', [input.businessId, source.accountId]);
    const account = accounts[0]; if (!account) throw new FinanceNotFoundError('Cuenta no disponible.');
    if (account.archived || account.currency !== 'PYG' || account.openingId !== null) throw new FinanceConflictError('La apertura requiere una cuenta propia activa sin corte anterior.');
    if (!Number.isSafeInteger(source.amountMinor) || new Date(source.occurredAt).getTime() > Date.now()) throw new FinanceInputError('Apertura importada inválida.');
    const id = randomUUID();
    await tx.execute('INSERT INTO "FinanceOpening" (id,"businessId","accountId","amountMinor","occurredAt",reason,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,$5::timestamp,$6,$7,CURRENT_TIMESTAMP)', [id, input.businessId, source.accountId, BigInt(source.amountMinor), source.occurredAt, source.reason, input.actorUserId]);
    await requireUpdated(tx,'UPDATE "FinanceAccount" SET version=version+1 WHERE "businessId"=$1 AND id=$2 AND version=$3',[input.businessId,source.accountId,account.version]);
    return { id };
  }
  async expense(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistoryExpense): Promise<{ id: string }> {
    const created = await this.expenses(tx).createExpense(input,{ expenseDefinition: { ...source, lines: [...source.lines] }, consumedOn: source.consumedOn, dueOn: source.dueOn, settlement: null });
    return { id: created.expenseId };
  }
  async settlement(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistorySettlement, expenseId: string): Promise<{ id: string }> {
    const rows = await tx.query<{ version: number }>('SELECT version FROM "FinanceExpense" WHERE "businessId"=$1 AND id=$2', [input.businessId, expenseId]);
    if (!rows[0]) throw new FinanceNotFoundError('Gasto no disponible.');
    const settlement = { accountId: source.accountId, amountMinor: source.amountMinor, occurredAt: source.occurredAt, reference: source.reference };
    const id = await this.expenses(tx).settlement(input,expenseId,rows[0].version,settlement,{ includedInOpening: source.includedInOpening });
    return { id };
  }
  async paymentLink(tx: FinanceSqlTransaction, input: FinanceV2Mutation, link: BankPaymentLinkInput): Promise<BankSourceSnapshot> {
    const before = (await this.sources.load(tx,input.businessId,link.accountId)).find(source => source.sourceType === 'PAYMENT' && source.sourceId === link.paymentId);
    requireEligiblePayment(before);
    const rows = await tx.query<{ id: string; accountId: string; version: number }>('SELECT id,"accountId",version FROM "FinancePaymentLink" WHERE "businessId"=$1 AND "paymentId"=$2', [input.businessId,link.paymentId]);
    requireExactVersion(rows[0]?.version ?? 0,link.expectedLinkVersion);
    if (rows[0]) throw new FinanceConflictError('El cobro ya tiene una asignación de cuenta; utiliza el comando explícito de reasignación.');
    const accounts = await tx.query<{ archived: boolean; currency: string; openingId: string | null }>('SELECT a.archived,b.currency,o.id AS "openingId" FROM "FinanceAccount" a JOIN "Business" b ON b.id=a."businessId" LEFT JOIN "FinanceOpening" o ON o."accountId"=a.id AND o."businessId"=a."businessId" WHERE a."businessId"=$1 AND a.id=$2', [input.businessId,link.accountId]);
    requirePaymentLinkAccount(accounts[0]);
    await tx.execute('INSERT INTO "FinancePaymentLink" (id,"businessId","paymentId","accountId",version,"recordedByUserId","createdAt") VALUES ($1,$2,$3,$4,1,$5,CURRENT_TIMESTAMP)', [randomUUID(),input.businessId,link.paymentId,link.accountId,input.actorUserId]);
    const after = (await this.sources.load(tx,input.businessId,link.accountId)).find(source => source.sourceType === 'PAYMENT' && source.sourceId === link.paymentId);
    if (!after || after.accountId !== link.accountId || after.linkVersion !== 1) throw new FinanceConflictError('La asignación del cobro no produjo una fuente canónica.');
    return after;
  }
  async bankFee(tx: FinanceSqlTransaction, input: FinanceV2Mutation, plan: BankFeePlan, accountId: string): Promise<{expenseId:string;settlement:BankSourceSnapshot}> {
    if (plan.mode !== 'CREATE' || !('expenseDefinition' in plan.input)) throw new FinanceInputError('Creación de comisión inválida.');
    const fee = plan.input;
    if (plan.amountMinor !== -fee.expenseDefinition.amountMinor) throw new FinanceInputError('La comisión debe corresponder al gasto con signo bancario negativo.');
    const created = await this.expenses(tx).createExpense(input,{ expenseDefinition: { ...fee.expenseDefinition, lines: [...fee.expenseDefinition.lines] }, consumedOn: fee.consumedOn, dueOn: null, settlement: { accountId, amountMinor: fee.expenseDefinition.amountMinor, occurredAt: fee.occurredAt, reference: fee.reference } });
    const settlement = (await this.sources.load(tx,input.businessId,accountId)).find(source => source.sourceType === 'SETTLEMENT' && source.sourceId === created.settlementId);
    if (!settlement) throw new FinanceConflictError('La comisión no produjo una liquidación registrada.');
    return { expenseId: created.expenseId, settlement };
  }
  private expenses(tx: FinanceSqlTransaction) { return new FinanceV2AtomicExpenseWriter(tx,this.bookings,this.lockedBookingIds); }
}
