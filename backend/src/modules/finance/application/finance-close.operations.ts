import type { FinanceActor } from '../domain/finance.types';
import type { FinanceCloseSources, FinanceCloseSnapshot, FinancePeriod } from '../domain/finance-close.types';
import type { CloseResult } from './finance-close.use-cases';
import type { FinanceClosePackage } from './finance-close.package';

export const FINANCE_CLOSE_OPERATIONS = Symbol('FINANCE_CLOSE_OPERATIONS');
export const FINANCE_CLOSE_ACKNOWLEDGEMENT_KEYS = [
  'RECOGNITION_COVERAGE', 'ACCOUNT_OPENINGS', 'EVIDENCE', 'MOVEMENT_REVIEW', 'CASH_COUNTS',
] as const;
export type FinanceCloseAcknowledgementKey = typeof FINANCE_CLOSE_ACKNOWLEDGEMENT_KEYS[number];
export type FinanceCloseAcknowledgements = Partial<Record<FinanceCloseAcknowledgementKey, string>>;
export interface FinanceCreatePeriodCommand { from: string; to: string; reason: string }
export interface FinanceClosePeriodCommand {
  expectedVersion: number;
  expectedSourceToken: string;
  reason: string;
  acknowledgements: FinanceCloseAcknowledgements;
}
export interface FinanceReopenPeriodCommand { expectedVersion: number; reason: string }

/** Los acknowledgements no cambian severidad ni integridad calculadas por el servidor. */
export interface FinanceCloseOperations {
  listPeriods(actor: FinanceActor): Promise<readonly FinancePeriod[]>;
  createPeriod(actor: FinanceActor, command: FinanceCreatePeriodCommand, idempotencyKey: string): Promise<FinancePeriod>;
  prepareClose(actor: FinanceActor, periodId: string): Promise<FinanceCloseSources>;
  readSnapshot(actor: FinanceActor, periodId: string, snapshotId?: string): Promise<FinanceCloseSnapshot>;
  readPackage(actor: FinanceActor, periodId: string, snapshotId?: string): Promise<FinanceClosePackage>;
  closePeriod(actor: FinanceActor, periodId: string, command: FinanceClosePeriodCommand, idempotencyKey: string): Promise<CloseResult>;
  reopenPeriod(actor: FinanceActor, periodId: string, command: FinanceReopenPeriodCommand, idempotencyKey: string): Promise<CloseResult>;
}
