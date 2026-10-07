import { DISABLED_EXPENSE_POLICY, requireDraftDecision, requireDraftSubmission, requireDraftWithdrawal, requireEditableDraft, requireExactVersion, requireExpenseConfirmation, type ApprovalPolicyState, type DraftApprovalState } from './finance-v2-policy.rules';

const policy: ApprovalPolicyState = { id: 'policy1', version: 1, enabled: true, scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true };
const draft = (state: DraftApprovalState['state'] = 'SUBMITTED'): DraftApprovalState => ({
  id: 'draft1', version: 3, state, creatorUserId: 'owner1', submissionVersion: 2,
  approvalPolicyRevisionId: policy.id, confirmedExpenseId: null,
});

describe('Finance V2 approval policy', () => {
  it('keeps the policy disabled when none was explicitly defined', () => {
    expect(() => requireExpenseConfirmation(DISABLED_EXPENSE_POLICY, null)).not.toThrow();
    expect(() => requireExpenseConfirmation(DISABLED_EXPENSE_POLICY, draft('DRAFT'))).not.toThrow();
  });
  it('requires approved draft on each enabled confirmation entrypoint', () => {
    for (const source of [null, draft('DRAFT'), draft('SUBMITTED'), draft('REJECTED')]) {
      expect(() => requireExpenseConfirmation(policy, source)).toThrow();
    }
    expect(() => requireExpenseConfirmation(policy, draft('APPROVED'))).not.toThrow();
  });
  it('checks exact version before a state no-op', () => {
    expect(() => requireExactVersion(3, 2)).toThrow('versión');
    expect(() => requireEditableDraft(draft('DRAFT'), 2)).toThrow('versión');
    expect(() => requireExactVersion(3, 3.5)).toThrow('Versión inválida');
  });
  it('prevents creator approval even with OWNER access', () => {
    expect(() => requireDraftDecision(draft(), policy, 3, 'owner1', true)).toThrow('otro actor');
    expect(() => requireDraftDecision(draft(), policy, 3, 'owner2', true)).not.toThrow();
  });
  it('does not retain an approval permission after actor revocation', () => {
    expect(() => requireDraftDecision(draft(), policy, 3, 'owner2', false)).toThrow('no autorizada');
  });
  it('requires the policy pinned in the submitted snapshot', () => {
    expect(() => requireDraftDecision(draft(), { ...policy, id: 'policy2', version: 2 }, 3, 'owner2', true)).toThrow('política');
    expect(() => requireExpenseConfirmation({ ...policy, id: 'policy2' }, draft('APPROVED'))).toThrow('APPROVAL_REQUIRED');
  });
  it('requires explicit withdrawal before modifying submitted economy', () => {
    expect(() => requireEditableDraft(draft(), 3)).toThrow('Retira');
    expect(() => requireDraftWithdrawal(draft(), 3)).not.toThrow();
    expect(() => requireDraftWithdrawal(draft('APPROVED'), 3)).not.toThrow();
    expect(() => requireDraftWithdrawal(draft('CONFIRMED'), 3)).toThrow();
  });
  it('cannot confirm or resubmit a draft already linked to an expense', () => {
    const confirmed = { ...draft('DRAFT'), confirmedExpenseId: 'expense1' };
    expect(() => requireDraftSubmission(confirmed, 3)).toThrow('confirmado');
    expect(() => requireExpenseConfirmation(DISABLED_EXPENSE_POLICY, confirmed)).toThrow('confirmado');
  });
  it.each(['DRAFT', 'APPROVED', 'REJECTED', 'CONFIRMED'] as const)('rejects a decision outside SUBMITTED: %s', state => {
    expect(() => requireDraftDecision(draft(state), policy, 3, 'owner2', true)).toThrow('pendiente');
  });
});
