import { applyPaymentToPlan } from './prisma-payment-plan.repository';

describe('applyPaymentToPlan', () => {
  const aggregate = jest.fn();
  const findMany = jest.fn();
  const createMany = jest.fn();
  const findPayment = jest.fn();
  const findPlan = jest.fn();
  const queryRaw = jest.fn();
  let netAmountMinor: bigint;
  let effectiveApplications: ReturnType<typeof application>[];
  const transaction = {
    $queryRaw: queryRaw,
    payment: { findUnique: findPayment },
    paymentPlan: { findFirst: findPlan },
    paymentApplication: { aggregate, createMany },
    paymentPlanInstallment: { findMany },
  };

  beforeEach(() => {
    jest.resetAllMocks();
    netAmountMinor = 70n; effectiveApplications = [];
    findPayment.mockResolvedValue({ businessId: 'business', bookingId: 'booking' });
    findPlan.mockResolvedValue({ id: 'plan-id' });
    queryRaw.mockImplementation((query: TemplateStringsArray) => Promise.resolve(query.join('?').includes('FROM "PaymentEffectiveState" state')
      ? [{ paymentId: 'payment-id', businessId: 'business', bookingId: 'booking', currency: 'PYG', grossRecordedAmountMinor: netAmountMinor, voidedAmountMinor: 0n, refundedAmountMinor: 0n, netRetainedAmountMinor: netAmountMinor, paymentVersion: 1n, invalidMonetaryData: false, applicationInvalid: false }]
      : effectiveApplications));
    aggregate.mockResolvedValue({ _sum: { amountMinor: null } });
    createMany.mockResolvedValue({ count: 0 });
  });

  it('allocates oldest due first, then sortOrder, while keeping undated installments last', async () => {
    findMany.mockResolvedValue([
      { id: 'undated', amountMinor: 100n, dueDate: null, sortOrder: 0, applications: [] },
      { id: 'later', amountMinor: 40n, dueDate: new Date('2026-11-01'), sortOrder: 0, applications: [] },
      { id: 'older-second', amountMinor: 40n, dueDate: new Date('2026-10-01'), sortOrder: 1, applications: [] },
      { id: 'older-first', amountMinor: 30n, dueDate: new Date('2026-10-01'), sortOrder: 0, applications: [] },
    ]);

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 70n);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { paymentId: 'payment-id', installmentId: 'older-first', amountMinor: 30n },
        { paymentId: 'payment-id', installmentId: 'older-second', amountMinor: 40n },
      ],
    });
  });

  it('continues after a full installment and applies only its remaining Payment amount', async () => {
    netAmountMinor = 30n;
    effectiveApplications = [application('other-payment', 'full', 40n), application('other-payment', 'partial', 10n)];
    findMany.mockResolvedValue([
      { id: 'full', amountMinor: 40n, dueDate: new Date('2026-10-01'), sortOrder: 0, applications: [{ amountMinor: 40n }] },
      { id: 'partial', amountMinor: 60n, dueDate: null, sortOrder: 1, applications: [{ amountMinor: 10n }] },
    ]);

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 30n);

    expect(createMany).toHaveBeenCalledWith({
      data: [{ paymentId: 'payment-id', installmentId: 'partial', amountMinor: 30n }],
    });
  });

  it('does not duplicate applications for an already fully applied idempotent Payment', async () => {
    netAmountMinor = 40n;
    effectiveApplications = [application('payment-id', 'already-applied', 40n)];

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 40n);

    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects allocation that would exceed the remaining installment capacity', async () => {
    netAmountMinor = 20n;
    effectiveApplications = [application('other-payment', 'partial', 30n)];
    findMany.mockResolvedValue([
      { id: 'partial', amountMinor: 40n, dueDate: null, sortOrder: 0, applications: [{ amountMinor: 30n }] },
    ]);

    await expect(applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 20n))
      .rejects.toThrow('PAYMENT_APPLICATION_OVERFLOW');
    expect(createMany).not.toHaveBeenCalled();
  });
});

function application(paymentId: string, installmentId: string, amountMinor: bigint) {
  return { paymentId, installmentId, originalAmountMinor: amountMinor, reversedAmountMinor: 0n, effectiveAmountMinor: amountMinor, dueDate: null, sortOrder: 0, invalidMonetaryData: false, scoped: true };
}
