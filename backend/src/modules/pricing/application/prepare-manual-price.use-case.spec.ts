import { BusinessStatus } from '../../business/business.contract';
import { InvalidManualPriceOverrideInputError } from './manual-price-override.errors';
import {
  InvalidListRatePlansInputError,
  ListRatePlansBusinessArchivedError,
  ListRatePlansBusinessNotFoundError,
  ListRatePlansResourceNotFoundError,
  ListRatePlansResourceUnavailableError,
} from './list-rate-plans.use-case';
import { PrepareManualPriceUseCase } from './prepare-manual-price.use-case';

const businessId = '11111111-1111-4111-8111-111111111111';
const resourceId = '22222222-2222-4222-8222-222222222222';
const input = { businessId, resourceId, checkIn: '2026-09-24', checkOut: '2026-09-26', agreedAmountMinor: 500000, overrideReason: '  Acuerdo directo  ' };

describe('Precio manual sin tarifario referenciado', () => {
  const findBusiness = jest.fn();
  const findResource = jest.fn();
  const subject = new PrepareManualPriceUseCase(
    { findById: findBusiness } as never,
    { findByIdAndBusinessId: findResource },
  );

  beforeEach(() => {
    jest.resetAllMocks();
    findBusiness.mockResolvedValue({ currency: 'PYG', status: BusinessStatus.ACTIVE });
    findResource.mockResolvedValue({ status: 'ACTIVE' });
  });

  it.each([0, 500000, Number.MAX_SAFE_INTEGER])('conserva el total %s y no inventa referencia o descuento', async (amount) => {
    await expect(subject.execute({ ...input, agreedAmountMinor: amount })).resolves.toEqual({
      currency: 'PYG',
      snapshot: {
        resourceId, ratePlanId: null, pricingMode: 'MANUAL_NO_RATE_PLAN',
        suggestedAmountMinor: null, adjustmentAmountMinor: null,
        agreedAmountMinor: amount, overrideReason: 'Acuerdo directo', nights: 2, breakdown: [],
      },
    });
    expect(findBusiness).toHaveBeenCalledWith(businessId);
    expect(findResource).toHaveBeenCalledWith(resourceId, businessId);
  });

  it.each([undefined, null, -1, 0.5, '500', Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])('rechaza un importe inválido %s', async (amount) => {
    await expect(subject.execute({ ...input, agreedAmountMinor: amount })).rejects.toBeInstanceOf(InvalidManualPriceOverrideInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it.each([undefined, null, 123, '', ' ', 'a', 'a'.repeat(501)])('exige motivo válido %#', async (reason) => {
    await expect(subject.execute({ ...input, overrideReason: reason })).rejects.toBeInstanceOf(InvalidManualPriceOverrideInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it.each([
    { businessId: 'invalid' }, { resourceId: 'invalid' },
    { checkIn: '2026-02-30' }, { checkOut: '2026-02-30' },
    { checkOut: '2026-09-24' }, { checkOut: '2026-09-23' },
    { checkIn: '2026-01-01', checkOut: '2027-01-02' },
  ])('rechaza identificadores y fechas inválidas %#', async (invalid) => {
    await expect(subject.execute({ ...input, ...invalid })).rejects.toBeInstanceOf(InvalidListRatePlansInputError);
    expect(findBusiness).not.toHaveBeenCalled();
  });

  it('obtiene la moneda del Business activo', async () => {
    findBusiness.mockResolvedValueOnce({ currency: 'USD', status: BusinessStatus.ACTIVE });
    await expect(subject.execute(input)).resolves.toMatchObject({ currency: 'USD' });
  });

  it('rechaza Business inexistente o no activo', async () => {
    findBusiness.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansBusinessNotFoundError);
    findBusiness.mockResolvedValueOnce({ currency: 'PYG', status: BusinessStatus.ARCHIVED });
    await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansBusinessArchivedError);
    expect(findResource).not.toHaveBeenCalled();
  });

  it('oculta Resource ajeno y rechaza Resource no operativo', async () => {
    findResource.mockResolvedValueOnce(null);
    await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansResourceNotFoundError);
    findResource.mockResolvedValueOnce({ status: 'ARCHIVED' });
    await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansResourceUnavailableError);
    findResource.mockResolvedValueOnce({ status: 'OUT_OF_SERVICE' });
    await expect(subject.execute(input)).rejects.toBeInstanceOf(ListRatePlansResourceUnavailableError);
  });
});
