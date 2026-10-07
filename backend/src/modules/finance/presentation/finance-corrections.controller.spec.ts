import { Prisma } from '@prisma/client';
import { Capability } from '../../../shared/application/authorization-policy';
import { FinancePeriodClosedError } from '../../../shared/infrastructure/finance-period.guard';
import { BUSINESS_ACCESS_KEY } from '../../../shared/security/security.decorators';
import type { AuthenticatedRequest } from '../../../shared/security/authenticated-principal';
import { PaymentAdjustmentInputError, PaymentAdjustmentForbiddenError, PaymentAdjustmentNotFoundError, PaymentAdjustmentConflictError } from '../../payment/payment.contract';
import type { FinancePaymentAdjustmentResult } from '../domain/finance-corrections.types';
import type { FinanceCorrectionsUseCases } from '../application/finance-corrections.use-cases';
import { FinanceCorrectionsController } from './finance-corrections.controller';

const request = { authenticatedPrincipal: { userId: 'owner' } } as unknown as AuthenticatedRequest;

function fixture() {
  const mutation = jest.fn<Promise<FinancePaymentAdjustmentResult>, [unknown, unknown, unknown]>();
  const useCases = { paymentAdjustment: mutation } as unknown as FinanceCorrectionsUseCases;
  return { mutation, controller: new FinanceCorrectionsController(useCases) };
}

function handler(name: string): object {
  const value: unknown = Object.getOwnPropertyDescriptor(FinanceCorrectionsController.prototype, name)?.value;
  if (typeof value !== 'function') throw new Error('Controller handler missing');
  return value;
}

describe('Finance correction controller unit contract (no HTTP/guard execution)', () => {
  it('declares static owner capabilities for each explicit command discriminator', () => {
    const payment: unknown = Reflect.getMetadata(BUSINESS_ACCESS_KEY, handler('adjustment'));
    const terminal: unknown = Reflect.getMetadata(BUSINESS_ACCESS_KEY, handler('terminal'));
    expect(payment).toMatchObject({ parameter: 'businessId', capabilities: [Capability.FINANCE_WRITE], bodySelector: { field: 'type', capabilities: { VOID_PAYMENT: Capability.PAYMENT_VOID, REFUND_PAYMENT: Capability.PAYMENT_REFUND } } });
    expect(terminal).toMatchObject({ bodySelector: { capabilities: { SET_TERMINAL_FINAL_AMOUNT: Capability.PRICING_FINAL_AMOUNT } } });
  });

  it.each([
    [new PaymentAdjustmentInputError('Input'), 400],
    [new PaymentAdjustmentForbiddenError('Denied'), 403],
    [new PaymentAdjustmentNotFoundError('Missing'), 404],
    [new PaymentAdjustmentConflictError('Stale'), 409],
    [new FinancePeriodClosedError(), 409],
  ])('maps a public writer error to %s without claiming transport execution', async (error, status) => {
    const scope = fixture(); scope.mutation.mockRejectedValue(error);
    await expect(scope.controller.adjustment('business', {}, 'idem', request)).rejects.toMatchObject({ status });
  });

  it('maps a SQL close-trigger error to409 and removes raw SQL details from the response', async () => {
    const scope = fixture();
    scope.mutation.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('private SQL details', { code: 'P2010', clientVersion: '6.19.3', meta: { code: 'P0001', message: 'FINANCE_PERIOD_CLOSED private SQL details' } }));
    await expect(scope.controller.adjustment('business', {}, 'idem', request)).rejects.toMatchObject({ status: 409, message: new FinancePeriodClosedError().message });
  });

  it('rejects an unauthenticated principal before the use-case invocation', async () => {
    const scope = fixture();
    await expect(scope.controller.adjustment('business', {}, 'idem', {} as AuthenticatedRequest)).rejects.toMatchObject({ status: 401 });
    expect(scope.mutation).not.toHaveBeenCalled();
  });
});
