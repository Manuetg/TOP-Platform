import { BusinessStatus } from '../../business/business.contract';
import { InvalidManualPriceOverrideInputError } from './manual-price-override.errors';
import { ListRatePlansBusinessArchivedError, ListRatePlansBusinessNotFoundError, ListRatePlansResourceNotFoundError } from './list-rate-plans.use-case';
import { PrepareManualPriceUseCase, ManualPriceRatePlanAvailableError } from './prepare-manual-price.use-case';

const input = { businessId: 'business', resourceId: 'resource', checkIn: '2026-09-24', checkOut: '2026-09-26', agreedAmountMinor: 500000, overrideReason: '  Acuerdo directo  ' };
describe('Precio excepcional sin Rate Plan', () => {
  const list = jest.fn(); const find = jest.fn();
  const subject = new PrepareManualPriceUseCase({ execute: list } as never, { findById: find } as never);
  beforeEach(() => { jest.resetAllMocks(); list.mockResolvedValue([]); find.mockResolvedValue({ currency: 'PYG', status: BusinessStatus.ACTIVE }); });
  it.each([0, 500000, Number.MAX_SAFE_INTEGER])('conserva el total %s y no inventa referencia o descuento', async (amount) => {
    await expect(subject.execute({ ...input, agreedAmountMinor: amount })).resolves.toEqual({ currency: 'PYG', snapshot: { resourceId: input.resourceId, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN', suggestedAmountMinor: null, adjustmentAmountMinor: null, agreedAmountMinor: amount, overrideReason: 'Acuerdo directo', nights: 2, breakdown: [] } });
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ businessId: input.businessId, resourceId: input.resourceId, checkIn: input.checkIn, checkOut: input.checkOut }));
  });
  it.each([undefined, null, -1, 0.5, '500', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rechaza un importe inválido %s', async (amount) => {
    await expect(subject.execute({ ...input, agreedAmountMinor: amount })).rejects.toBeInstanceOf(InvalidManualPriceOverrideInputError); expect(list).not.toHaveBeenCalled();
  });
  it.each([undefined, null, 123, '', ' ', 'a', 'a'.repeat(501)])('exige motivo válido %#', async (reason) => {
    await expect(subject.execute({ ...input, overrideReason: reason })).rejects.toBeInstanceOf(InvalidManualPriceOverrideInputError); expect(list).not.toHaveBeenCalled();
  });
  it('rechaza la excepción si un plan ya es aplicable al confirmar', async () => {
    list.mockResolvedValue([{}]); await expect(subject.execute(input)).rejects.toBeInstanceOf(ManualPriceRatePlanAvailableError);
  });
  it('no confunde error de consulta con ausencia de planes', async () => {
    list.mockRejectedValue(new ListRatePlansResourceNotFoundError()); await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansResourceNotFoundError); expect(find).not.toHaveBeenCalled();
  });
  it('revalida el Business al obtener la moneda', async () => {
    find.mockResolvedValueOnce(null); await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansBusinessNotFoundError);
    find.mockResolvedValueOnce({ status: BusinessStatus.ARCHIVED }); await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansBusinessArchivedError);
  });
});
