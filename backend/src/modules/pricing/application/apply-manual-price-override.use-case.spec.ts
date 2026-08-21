import { InvalidCalculatePriceInputError } from './calculate-price.errors';
import { ApplyManualPriceOverrideUseCase } from './apply-manual-price-override.use-case';
import { InvalidManualPriceOverrideInputError } from './manual-price-override.errors';
import { NightlyPriceSource } from '../domain/pricing-calculator';

const businessId = '11111111-1111-4111-8111-111111111111';
const ratePlanId = '22222222-2222-4222-8222-222222222222';
const resourceId = '33333333-3333-4333-8333-333333333333';
const price = {
  businessId,
  resourceId,
  ratePlanId,
  currency: 'PYG',
  checkIn: '2026-12-18',
  checkOut: '2026-12-22',
  nights: 4,
  baseNightlyAmountMinor: 450000,
  totalAmountMinor: 2200000,
  breakdown: [
    { date: '2026-12-18', amountMinor: 450000, source: NightlyPriceSource.BASE },
    { date: '2026-12-19', amountMinor: 450000, source: NightlyPriceSource.BASE },
    { date: '2026-12-20', amountMinor: 650000, source: NightlyPriceSource.SEASONAL, seasonalRateId: '44444444-4444-4444-8444-444444444444', seasonalRateName: 'Navidad' },
    { date: '2026-12-21', amountMinor: 650000, source: NightlyPriceSource.SEASONAL, seasonalRateId: '44444444-4444-4444-8444-444444444444', seasonalRateName: 'Navidad' },
  ],
};
const input = { businessId, ratePlanId, resourceId, checkIn: price.checkIn, checkOut: price.checkOut, agreedAmountMinor: 2000000, overrideReason: ' Descuento comercial ' };

describe('ApplyManualPriceOverrideUseCase', () => {
  const calculate = jest.fn();
  const useCase = new ApplyManualPriceOverrideUseCase({ execute: calculate } as never);

  beforeEach(() => jest.resetAllMocks());

  it.each([
    ['discount', 2000000, -200000],
    ['same price', 2200000, 0],
    ['surcharge', 2400000, 200000],
    ['complimentary stay', 0, -2200000],
  ])('applies a %s total without changing the server-side suggestion', async (_scenario, agreedAmountMinor, adjustmentAmountMinor) => {
    calculate.mockResolvedValueOnce(price);
    const result = await useCase.execute({ ...input, agreedAmountMinor });
    expect(calculate).toHaveBeenCalledWith({ businessId, ratePlanId, resourceId, checkIn: price.checkIn, checkOut: price.checkOut });
    expect(result).toEqual({ businessId, resourceId, ratePlanId, currency: 'PYG', checkIn: price.checkIn, checkOut: price.checkOut, nights: 4, pricingMode: 'MANUAL_OVERRIDE', suggestedAmountMinor: price.totalAmountMinor, agreedAmountMinor, adjustmentAmountMinor, overrideReason: 'Descuento comercial', suggestedBreakdown: price.breakdown });
    expect(result).not.toHaveProperty('totalAmountMinor');
  });

  it.each([undefined, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, '2000000', true])('rejects invalid agreed amounts without calculating', async (agreedAmountMinor) => {
    await expect(useCase.execute({ ...input, agreedAmountMinor })).rejects.toThrow('El importe acordado debe ser un entero seguro no negativo.');
    expect(calculate).not.toHaveBeenCalled();
  });

  it.each([
    [undefined, 'El motivo del precio personalizado es obligatorio.'],
    [' ', 'El motivo del precio personalizado debe tener entre 2 y 500 caracteres.'],
    ['a', 'El motivo del precio personalizado debe tener entre 2 y 500 caracteres.'],
    ['x'.repeat(501), 'El motivo del precio personalizado debe tener entre 2 y 500 caracteres.'],
  ])('rejects invalid reasons without calculating', async (overrideReason, message) => {
    await expect(useCase.execute({ ...input, overrideReason })).rejects.toEqual(new InvalidManualPriceOverrideInputError(message));
    expect(calculate).not.toHaveBeenCalled();
  });

  it('preserves inherited calculation errors and has no persistence dependency', async () => {
    const failure = new InvalidCalculatePriceInputError('La fecha de entrada es inválida.');
    calculate.mockRejectedValueOnce(failure);
    await expect(useCase.execute(input)).rejects.toBe(failure);
    expect(calculate).toHaveBeenCalledTimes(1);
  });
});
