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
      { id: 'undated', amountMinor: 100, dueDate: null, sortOrder: 0, applications: [] },
      { id: 'later', amountMinor: 40, dueDate: new Date('2026-11-01'), sortOrder: 0, applications: [] },
      { id: 'older-second', amountMinor: 40, dueDate: new Date('2026-10-01'), sortOrder: 1, applications: [] },
      { id: 'older-first', amountMinor: 30, dueDate: new Date('2026-10-01'), sortOrder: 0, applications: [] },
    ]);

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 70);

    expect(createMany).toHaveBeenCalledWith({
      data: [
        { paymentId: 'payment-id', installmentId: 'older-first', amountMinor: 30 },
        { paymentId: 'payment-id', installmentId: 'older-second', amountMinor: 40 },
      ],
    });
  });

  it('continues after a full installment and applies only its remaining Payment amount', async () => {
    findMany.mockResolvedValue([
      { id: 'full', amountMinor: 40, dueDate: new Date('2026-10-01'), sortOrder: 0, applications: [{ amountMinor: 40 }] },
      { id: 'partial', amountMinor: 60, dueDate: null, sortOrder: 1, applications: [{ amountMinor: 10 }] },
    ]);

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 30);

    expect(createMany).toHaveBeenCalledWith({
      data: [{ paymentId: 'payment-id', installmentId: 'partial', amountMinor: 30 }],
    });
  });

  it('does not duplicate applications for an already fully applied idempotent Payment', async () => {
    aggregate.mockResolvedValue({ _sum: { amountMinor: 40 } });

    await applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 40);

    expect(findMany).not.toHaveBeenCalled();
    expect(createMany).not.toHaveBeenCalled();
  });

  it('rejects allocation that would exceed the remaining installment capacity', async () => {
    findMany.mockResolvedValue([
      { id: 'partial', amountMinor: 40, dueDate: null, sortOrder: 0, applications: [{ amountMinor: 30 }] },
    ]);

    await expect(applyPaymentToPlan(transaction as never, 'plan-id', 'payment-id', 20))
      .rejects.toThrow('PAYMENT_APPLICATION_OVERFLOW');
    expect(createMany).not.toHaveBeenCalled();
  });
});
