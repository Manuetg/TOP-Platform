import { AuthorizationPolicy, Capability } from '../../../shared/application/authorization-policy';
import { MembershipRole } from '../../identity/identity.contract';
import type { FinanceV2CommandType } from '../domain/finance-v2.types';
import { financeV2CommandCapability } from './finance-v2-command-capability';

const expectedCapabilities = [
  ['CONFIRM_HISTORY_IMPORT', Capability.FINANCE_IMPORT],
  ['CONFIRM_BANK_STATEMENT', Capability.FINANCE_IMPORT],
  ['SET_EXPENSE_APPROVAL_POLICY', Capability.FINANCE_APPROVE],
  ['DECIDE_EXPENSE_DRAFT', Capability.FINANCE_APPROVE],
  ['APPROVE_BUDGET_REVISION', Capability.FINANCE_APPROVE],
  ['CREATE_LABOR_COST', Capability.FINANCE_LABOR],
  ['REVISE_LABOR_COST', Capability.FINANCE_LABOR],
  ['CREATE_BUDGET_REVISION', Capability.FINANCE_PLANNING],
  ['CREATE_COMMITMENT', Capability.FINANCE_PLANNING],
  ['CANCEL_COMMITMENT', Capability.FINANCE_PLANNING],
  ['CONVERT_COMMITMENT', Capability.FINANCE_PLANNING],
  ['CREATE_EXPENSE_TEMPLATE', Capability.FINANCE_WRITE],
  ['REVISE_EXPENSE_TEMPLATE', Capability.FINANCE_WRITE],
  ['GENERATE_RECURRING_DRAFT', Capability.FINANCE_WRITE],
  ['CREATE_EXPENSE_DRAFT', Capability.FINANCE_WRITE],
  ['EDIT_EXPENSE_DRAFT', Capability.FINANCE_WRITE],
  ['SUBMIT_EXPENSE_DRAFT', Capability.FINANCE_WRITE],
  ['WITHDRAW_EXPENSE_DRAFT', Capability.FINANCE_WRITE],
  ['CONFIRM_EXPENSE_DRAFT', Capability.FINANCE_WRITE],
  ['CREATE_REIMBURSEMENT_DRAFT', Capability.FINANCE_WRITE],
  ['REIMBURSE_EXPENSE', Capability.FINANCE_WRITE],
  ['CONFIRM_BANK_MATCH', Capability.FINANCE_WRITE],
  ['CANCEL_BANK_MATCH', Capability.FINANCE_WRITE],
  ['CREATE_ALLOCATION_RULE', Capability.FINANCE_WRITE],
  ['REVISE_ALLOCATION_RULE', Capability.FINANCE_WRITE],
  ['APPLY_COST_ALLOCATION', Capability.FINANCE_WRITE],
] as const satisfies readonly (readonly [FinanceV2CommandType, Capability])[];

describe('Finance V2 capabilities preserve separate authority for each financial operation', () => {
  it.each(expectedCapabilities)('%s requires the approved %s capability', (command, capability) => {
    expect(financeV2CommandCapability(command)).toBe(capability);
  });

  it('allows OWNER through the real policy for every classified operation', () => {
    const policy = new AuthorizationPolicy();
    for (const [command] of expectedCapabilities) {
      expect(policy.isAllowed(MembershipRole.OWNER, financeV2CommandCapability(command))).toBe(true);
    }
  });

  it.each([MembershipRole.ADMIN, MembershipRole.RECEPTIONIST, MembershipRole.VIEWER])('%s cannot inherit any financial command capability from operational access', role => {
    const policy = new AuthorizationPolicy();
    expect(policy.isAllowed(role, Capability.BOOKING_READ)).toBe(true);
    expect(policy.isAllowed(role, Capability.PAYMENT_READ)).toBe(true);
    for (const [command] of expectedCapabilities) {
      expect(policy.isAllowed(role, financeV2CommandCapability(command))).toBe(false);
    }
  });

  it('denies an unknown persisted role for every valid financial command capability', () => {
    const policy = new AuthorizationPolicy();
    for (const [command] of expectedCapabilities) {
      expect(policy.isAllowed('UNKNOWN_ROLE' as MembershipRole, financeV2CommandCapability(command))).toBe(false);
    }
  });
});
