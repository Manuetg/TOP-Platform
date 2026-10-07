export class TerminalFinalAmountInputError extends Error {}
export class TerminalFinalAmountConflictError extends Error {}
export class TerminalFinalAmountForbiddenError extends Error {}
export class TerminalFinalAmountNotFoundError extends Error {}

export interface TerminalFinalAmountInput {
  businessId: string; bookingId: string; actorUserId: string; requestId: string;
  expectedBookingUpdatedAt: string; currentPricingId: string; expectedFinancialVersion: number;
  finalAmountMinor: number; reason: string;
}

export interface TerminalFinalAmountResult {
  id: string; type: 'SET_TERMINAL_FINAL_AMOUNT'; version: number; bookingId: string;
  currentPricingId: string; pricingRevisionId: string; revisionNumber: number;
  totalAmountMinor: number; financialVersion: number; bookingUpdatedAt: string;
  amounts: { grossRecordedAmountMinor: number; voidedAmountMinor: number; refundedAmountMinor: number; netRetainedAmountMinor: number; financialVersion: number };
}

export function validateTerminalInput(input: Pick<TerminalFinalAmountInput, 'finalAmountMinor' | 'reason'>): string {
  if (!Number.isSafeInteger(input.finalAmountMinor) || input.finalAmountMinor < 0) throw new TerminalFinalAmountInputError('El importe final debe ser un entero seguro no negativo.');
  if (typeof input.reason !== 'string' || input.reason.trim().length < 2 || input.reason.trim().length > 500) throw new TerminalFinalAmountInputError('El motivo debe contener entre 2 y 500 caracteres.');
  return input.reason.trim();
}

export function requireTerminalAgreement(status: string, resourceIds: readonly string[], serviceResourceIds: readonly string[]): void {
  if (!['CANCELLED', 'NO_SHOW'].includes(status) || resourceIds.length !== 1 || serviceResourceIds.length !== 1 || resourceIds[0] !== serviceResourceIds[0]) {
    throw new TerminalFinalAmountConflictError('El importe final requiere una reserva cancelada o no-show y conservar exactamente el recurso acordado.');
  }
}
