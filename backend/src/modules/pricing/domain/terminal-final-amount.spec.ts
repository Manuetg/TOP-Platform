import { requireTerminalAgreement, TerminalFinalAmountConflictError, TerminalFinalAmountInputError, validateTerminalInput } from './terminal-final-amount';

describe('terminal final amount manual agreement', () => {
  it('Given terminal Booking When choosing zero final Then accepts explicit reason without inferring penalty', () => {
    expect(validateTerminalInput({ finalAmountMinor: 0, reason: '  Acuerdo final manual  ' })).toBe('Acuerdo final manual');
    expect(() => requireTerminalAgreement('CANCELLED', ['resource'], ['resource'])).not.toThrow();
    expect(() => requireTerminalAgreement('NO_SHOW', ['resource'], ['resource'])).not.toThrow();
  });
  it.each([-1, 0.1, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects invalid final amount %s', (finalAmountMinor) => {
    expect(() => validateTerminalInput({ finalAmountMinor, reason: 'Motivo manual' })).toThrow(TerminalFinalAmountInputError);
  });
  it.each(['', 'x', 'x'.repeat(501)])('requires real reason of2..500 characters', (reason) => {
    expect(() => validateTerminalInput({ finalAmountMinor: 1, reason })).toThrow(TerminalFinalAmountInputError);
  });
  it.each(['DRAFT', 'PENDING', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED'])('rejects state %s', (status) => {
    expect(() => requireTerminalAgreement(status, ['resource'], ['resource'])).toThrow(TerminalFinalAmountConflictError);
  });
  it('rejects ambiguous, missing or replaced agreed Resource', () => {
    for (const [booking, service] of [[[], ['resource']], [['resource'], []], [['resource', 'second'], ['resource']], [['resource'], ['second']], [['resource'], ['resource', 'second']]]) {
      expect(() => requireTerminalAgreement('CANCELLED', booking, service)).toThrow(TerminalFinalAmountConflictError);
    }
  });
});
