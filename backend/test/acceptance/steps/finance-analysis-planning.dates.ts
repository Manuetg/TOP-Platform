import { strict as assert } from 'node:assert';
import type { FinanceAging } from '../../../src/modules/finance/domain/finance-v2.types';
import { analysisCut, analysisGet, type AnalysisWorld } from './finance-analysis-planning.support';

/** Calendar arithmetic on a business-local date, without changing the actual app clock. */
export function analysisShiftDay(localDay: string, days: number): string {
  assert.match(localDay, /^\d{4}-\d{2}-\d{2}$/u);
  const date = new Date(`${localDay}T00:00:00.000Z`);
  assert.equal(date.toISOString().slice(0, 10), localDay);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
export function analysisBusinessDay(asOf: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(asOf));
  const part = (name: string): string => { const value = parts.find(item => item.type === name)?.value; assert.ok(value); return value; };
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export async function analysisClock(world: AnalysisWorld): Promise<{ asOf: string; today: string }> {
  const result = (await analysisGet(world, 'v2/aging').query({ asOf: analysisCut() }).expect(200)).body as FinanceAging;
  assert.equal(result.businessId, world.financeFixture.business.id);
  assert.equal(result.timeZone, world.financeFixture.business.timezone);
  const today = analysisBusinessDay(result.asOf, result.timeZone);
  assert.equal(result.today, today);
  return { asOf: result.asOf, today };
}
