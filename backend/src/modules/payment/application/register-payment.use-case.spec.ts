describe('RegisterPaymentUseCase', () => {
  it.each([0, -1, 1.5])('rejects invalid amounts', () => undefined);
  it.each(['DRAFT', 'PENDING', 'CANCELLED', 'NO_SHOW'])('rejects unsupported booking status', () => undefined);
  it('rejects missing snapshot and future paidAt', () => undefined);
  it('normalizes reference and note', () => undefined);
  it('rejects overpayment', () => undefined);
  it('returns the existing payment on identical idempotent retry', () => undefined);
  it('rejects a reused idempotency key with different fingerprint', () => undefined);
});
