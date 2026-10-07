import type { BankFeePlan, BankMatchInput, BankMatchSnapshot, BankPaymentLinkInput, BankSourceSnapshot, BankStatementInput, BankStatementSnapshot } from '../application/finance-v2-bank.types';
import type { HistoryExpense, HistoryImportInput, HistoryOpening, HistorySettlement, ImportSnapshot } from '../application/finance-v2-import.types';
import type { FinanceV2Mutation } from '../domain/finance-v2.types';
import type { FinanceSqlTransaction } from './finance-v2.repository';

// Every read uses this same transaction; bank source readers use Payment's public effective-source contract.
export interface FinanceImportBankSnapshotReader {
  history(tx: FinanceSqlTransaction, input: HistoryImportInput): Promise<ImportSnapshot>;
  statement(tx: FinanceSqlTransaction, input: BankStatementInput): Promise<BankStatementSnapshot>;
  match(tx: FinanceSqlTransaction, input: BankMatchInput): Promise<BankMatchSnapshot>;
}
// These methods join the caller transaction. No Payment, sale, or cash movement is fabricated for bank evidence.
export interface FinanceImportBankAtomicWriter {
  withBookingLocks?(lockedBookingIds: ReadonlySet<string>): FinanceImportBankAtomicWriter;
  opening(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistoryOpening): Promise<{ id: string }>;
  expense(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistoryExpense): Promise<{ id: string }>;
  settlement(tx: FinanceSqlTransaction, input: FinanceV2Mutation, source: HistorySettlement, expenseId: string): Promise<{ id: string }>;
  paymentLink(tx: FinanceSqlTransaction, input: FinanceV2Mutation, link: BankPaymentLinkInput): Promise<BankSourceSnapshot>;
  bankFee(tx: FinanceSqlTransaction, input: FinanceV2Mutation, plan: BankFeePlan, accountId: string): Promise<{ expenseId: string; settlement: BankSourceSnapshot }>;
}
