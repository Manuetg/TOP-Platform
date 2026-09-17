import { applyPaymentToPlan } from './prisma-payment-plan.repository';

describe('applyPaymentToPlan', () => {
  const aggregate = jest.fn();
  const findMany = jest.fn();
  const createMany = jest.fn();
  const transaction = {
    paymentApplication: { aggregate, createMany },
    paymentPlanInstallment: { findMany },
  };

  beforeEach(() => {
    jest.resetAllMocks();
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
    aggregate.mockResolvedValue({ _sum: { amountMinor: 40n } });

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 40n);

    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects allocation that would exceed the remaining installment capacity', async () => {
    findMany.mockResolvedValue([
      { id: 'partial', amountMinor: 40n, dueDate: null, sortOrder: 0, applications: [{ amountMinor: 30n }] },
    ]);

    await expect(applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 20n))
      .rejects.toThrow('PAYMENT_APPLICATION_OVERFLOW');
    expect(createMany).not.toHaveBeenCalled();
  });
});
