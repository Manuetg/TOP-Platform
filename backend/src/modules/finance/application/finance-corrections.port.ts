import type { FinanceActor } from '../domain/finance.types';
import type { FinanceCorrectionsData, FinancePaymentAdjustmentCommand, FinancePaymentAdjustmentResult, FinanceTerminalPricingCommand, FinanceTerminalPricingResult } from '../domain/finance-corrections.types';

export type FinanceCorrectionCommand = FinancePaymentAdjustmentCommand | FinanceTerminalPricingCommand;
export type FinanceCorrectionResult = FinancePaymentAdjustmentResult | FinanceTerminalPricingResult;
export interface FinanceCorrectionMutation extends FinanceActor { command: FinanceCorrectionCommand; idempotencyKey: string; fingerprint: string }
export const FINANCE_CORRECTIONS_REPOSITORY = Symbol('FINANCE_CORRECTIONS_REPOSITORY');
export interface FinanceCorrectionsRepository {
  read(actor: FinanceActor): Promise<FinanceCorrectionsData>;
  execute(input: FinanceCorrectionMutation): Promise<FinanceCorrectionResult>;
}
