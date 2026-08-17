import { PricingCalculator, NightlyPriceSource } from './pricing-calculator';
import { SeasonalRate } from './seasonal-rate.entity';

const season = (id: string, startDate: string, endDate: string, amountMinor = 650000): SeasonalRate => SeasonalRate.create({ id, ratePlanId: '22222222-2222-4222-8222-222222222222', name: `Season ${id}`, amountMinor, currency: 'PYG', startDate, endDate, createdAt: new Date(), updatedAt: new Date() });

describe('PricingCalculator', () => {
  const calculator = new PricingCalculator();

  it('calculates the base to seasonal central case deterministically', () => {
    expect(calculator.calculate(450000, '2026-12-18', '2026-12-22', [season('33333333-3333-4333-8333-333333333333', '2026-12-20', '2027-01-06')])).toEqual({
      nights: 4,
      totalAmountMinor: 2200000,
      breakdown: [
        { date: '2026-12-18', amountMinor: 450000, source: NightlyPriceSource.BASE },
        { date: '2026-12-19', amountMinor: 450000, source: NightlyPriceSource.BASE },
        { date: '2026-12-20', amountMinor: 650000, source: NightlyPriceSource.SEASONAL, seasonalRateId: '33333333-3333-4333-8333-333333333333', seasonalRateName: 'Season 33333333-3333-4333-8333-333333333333' },
        { date: '2026-12-21', amountMinor: 650000, source: NightlyPriceSource.SEASONAL, seasonalRateId: '33333333-3333-4333-8333-333333333333', seasonalRateName: 'Season 33333333-3333-4333-8333-333333333333' },
      ],
    });
  });

  it('supports multiple seasons, base gaps, leap day and exclusive boundaries', () => {
    const result = calculator.calculate(100, '2028-02-28', '2028-03-04', [
      season('44444444-4444-4444-8444-444444444444', '2028-03-02', '2028-03-03', 300),
      season('33333333-3333-4333-8333-333333333333', '2028-02-29', '2028-03-01', 200),
      season('55555555-5555-4555-8555-555555555555', '2028-03-04', '2028-03-05', 400),
    ]);
    expect(result.breakdown.map((night) => [night.date, night.amountMinor])).toEqual([['2028-02-28', 100], ['2028-02-29', 200], ['2028-03-01', 100], ['2028-03-02', 300], ['2028-03-03', 100]]);
    expect(result.totalAmountMinor).toBe(800);
  });
  it('orders unsorted rates deterministically and rejects unsafe night amounts', () => {
    const result = calculator.calculate(100, '2026-01-01', '2026-01-03', [
      season('55555555-5555-4555-8555-555555555555', '2026-01-02', '2026-01-03', 300),
      season('44444444-4444-4444-8444-444444444444', '2026-01-01', '2026-01-02', 200),
    ]);
    expect(result.totalAmountMinor).toBe(500);
    expect(result.breakdown.map((night) => night.seasonalRateId)).toEqual(['44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555']);
    expect(() => calculator.calculate(Number.MAX_SAFE_INTEGER, '2026-01-01', '2026-01-03', [])).toThrow('El total calculado excede el rango seguro.');
  });
  it('uses deterministic first-season selection even if invalid overlapping input reaches the calculator', () => {
    const result = calculator.calculate(100, '2026-01-01', '2026-01-02', [
      season('55555555-5555-4555-8555-555555555555', '2026-01-01', '2026-01-02', 500),
      season('44444444-4444-4444-8444-444444444444', '2026-01-01', '2026-01-02', 200),
    ]);
    expect(result.breakdown).toEqual([{ date: '2026-01-01', amountMinor: 200, source: NightlyPriceSource.SEASONAL, seasonalRateId: '44444444-4444-4444-8444-444444444444', seasonalRateName: 'Season 44444444-4444-4444-8444-444444444444' }]);
  });
});
