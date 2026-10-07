import { Capability } from '../../../shared/application/authorization-policy';
import type { FinanceV2CommandType } from '../domain/finance-v2.types';

const capabilityByCommand: Readonly<Partial<Record<FinanceV2CommandType, Capability>>> = {
  CONFIRM_HISTORY_IMPORT: Capability.FINANCE_IMPORT,
  CONFIRM_BANK_STATEMENT: Capability.FINANCE_IMPORT,
  SET_EXPENSE_APPROVAL_POLICY: Capability.FINANCE_APPROVE,
  DECIDE_EXPENSE_DRAFT: Capability.FINANCE_APPROVE,
  APPROVE_BUDGET_REVISION: Capability.FINANCE_APPROVE,
  CREATE_LABOR_COST: Capability.FINANCE_LABOR,
  REVISE_LABOR_COST: Capability.FINANCE_LABOR,
  CREATE_BUDGET_REVISION: Capability.FINANCE_PLANNING,
  CREATE_COMMITMENT: Capability.FINANCE_PLANNING,
  CANCEL_COMMITMENT: Capability.FINANCE_PLANNING,
  CONVERT_COMMITMENT: Capability.FINANCE_PLANNING,
};

export function financeV2CommandCapability(type: FinanceV2CommandType): Capability {
  return capabilityByCommand[type] ?? Capability.FINANCE_WRITE;
}
