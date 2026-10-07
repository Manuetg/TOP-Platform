import { FinanceConflictError, FinanceForbiddenError, FinanceInputError } from '../domain/finance.errors';

export type DraftState = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'CONFIRMED';
export interface ApprovalPolicyState {
  id: string | null;
  version: number;
  enabled: boolean;
  scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS';
  requireDifferentActor: true;
}
export interface DraftApprovalState {
  id: string;
  version: number;
  state: DraftState;
  creatorUserId: string;
  submissionVersion: number | null;
  approvalPolicyRevisionId: string | null;
  confirmedExpenseId: string | null;
}
export const DISABLED_EXPENSE_POLICY: ApprovalPolicyState = Object.freeze({
  id: null, version: 0, enabled: false,
  scope: 'ALL_NEW_EXPENSE_CONFIRMATIONS', requireDifferentActor: true,
});

export function requireExactVersion(actual: number, expected: number): void {
  if (!Number.isSafeInteger(expected) || expected < 0) throw new FinanceInputError('Versión inválida.');
  if (actual !== expected) throw new FinanceConflictError('La versión cambió. Conserva el borrador y actualiza la fuente.');
}

export function requireEditableDraft(draft: DraftApprovalState, expectedVersion: number): void {
  requireExactVersion(draft.version, expectedVersion);
  if (draft.state !== 'DRAFT' && draft.state !== 'REJECTED') {
    throw new FinanceConflictError('Retira el borrador enviado antes de cambiar sus datos.');
  }
}

export function requireDraftSubmission(draft: DraftApprovalState, expectedVersion: number): void {
  requireEditableDraft(draft, expectedVersion);
  if (draft.confirmedExpenseId !== null) throw new FinanceConflictError('El borrador ya tiene un gasto confirmado.');
}

export function requireDraftDecision(
  draft: DraftApprovalState, policy: ApprovalPolicyState, expectedVersion: number,
  actorUserId: string, ownerCurrentlyAuthorized: boolean,
): void {
  requireExactVersion(draft.version, expectedVersion);
  if (!ownerCurrentlyAuthorized) throw new FinanceForbiddenError('Aprobación financiera no autorizada.');
  if (!policy.enabled || draft.approvalPolicyRevisionId !== policy.id) {
    throw new FinanceConflictError('El borrador no tiene una política de aprobación habilitada.');
  }
  if (draft.state !== 'SUBMITTED' || draft.submissionVersion === null) {
    throw new FinanceConflictError('El borrador no está pendiente de aprobación.');
  }
  if (draft.creatorUserId === actorUserId) throw new FinanceForbiddenError('La aprobación requiere otro actor.');
}

export function requireExpenseConfirmation(policy: ApprovalPolicyState, draft: DraftApprovalState | null): void {
  if (draft && draft.confirmedExpenseId !== null) {
    throw new FinanceConflictError('El borrador ya tiene un gasto confirmado.');
  }
  if (!draft) {
    if (policy.enabled) throw new FinanceConflictError('EXPENSE_APPROVAL_REQUIRED: confirma un borrador aprobado.');
    return;
  }
  if (draft.state === 'CONFIRMED' || draft.state === 'REJECTED') {
    throw new FinanceConflictError('El estado del borrador no permite confirmar.');
  }
  if (policy.enabled && (draft.state !== 'APPROVED' || draft.approvalPolicyRevisionId !== policy.id)) {
    throw new FinanceConflictError('EXPENSE_APPROVAL_REQUIRED: confirma un borrador aprobado.');
  }
}

export function requireDraftWithdrawal(draft: DraftApprovalState, expectedVersion: number): void {
  requireExactVersion(draft.version, expectedVersion);
  if (draft.state !== 'SUBMITTED' && draft.state !== 'APPROVED') {
    throw new FinanceConflictError('El borrador no está enviado ni aprobado.');
  }
}
