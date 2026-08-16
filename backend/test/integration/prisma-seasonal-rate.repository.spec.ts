import { PrismaClient } from '@prisma/client';
import { PrismaRatePlanRepository } from '../../src/modules/pricing/infrastructure/prisma-rate-plan.repository';
import { PrismaSeasonalRateRepository } from '../../src/modules/pricing/infrastructure/prisma-seasonal-rate.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;

describeWithPostgres('PrismaSeasonalRateRepository', () => {
  const prisma = new PrismaClient();
  const ratePlans = new PrismaRatePlanRepository(prisma);
  const seasons = new PrismaSeasonalRateRepository(prisma);
  beforeAll(async () => prisma.$connect());
  beforeEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterEach(async () => cleanTestDatabase(prisma, databaseUrl));
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function plan(name = 'Pricing') {
    const business = await prisma.business.create({ data: { name } });
    return ratePlans.create({ businessId: business.id, name: 'Base', description: null, baseNightlyAmountMinor: 450000, currency: 'PYG', validFrom: null, validTo: null, resourceIds: [] });
  }
  const data = (ratePlanId: string, startDate: string, endDate: string) => ({ ratePlanId, name: `${startDate}-${endDate}`, amountMinor: 650000, startDate, endDate, currency: 'PYG' });

  it('persiste, lista en orden y permite períodos contiguos', async () => {
    const current = await plan();
    await seasons.create(data(current.id, '2026-12-20', '2027-01-01'));
    await seasons.create(data(current.id, '2026-12-01', '2026-12-20'));
    const result = await seasons.listByRatePlanId(current.id);
    expect(result.map((item) => item.startDate)).toEqual(['2026-12-01', '2026-12-20']);
    expect(result[0]).toMatchObject({ ratePlanId: current.id, amountMinor: 650000, currency: 'PYG' });
  });

  it('rechaza overlap en el mismo plan, lo permite en otro y protege concurrencia', async () => {
    const first = await plan('First'); const second = await plan('Second');
    await seasons.create(data(first.id, '2026-12-20', '2026-12-30'));
    await expect(seasons.create(data(first.id, '2026-12-25', '2027-01-05'))).rejects.toThrow('superpone');
    await expect(seasons.create(data(second.id, '2026-12-25', '2027-01-05'))).resolves.toMatchObject({ ratePlanId: second.id });
    const concurrent = await plan('Concurrent');
    const results = await Promise.allSettled([seasons.create(data(concurrent.id, '2026-12-20', '2026-12-30')), seasons.create(data(concurrent.id, '2026-12-25', '2027-01-05'))]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    expect(await prisma.seasonalRate.count({ where: { ratePlanId: concurrent.id } })).toBe(1);
  });
});
