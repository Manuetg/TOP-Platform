import { PrismaClient } from '@prisma/client';
import { PrismaAvailabilityRulesRepository } from '../../src/modules/availability/infrastructure/prisma-availability-rules.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
describeWithPostgres('PrismaAvailabilityRulesRepository', () => {
  const prisma = new PrismaClient(); const repository = new PrismaAvailabilityRulesRepository(prisma);
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  it('uses one business-scoped configuration and updates it atomically', async () => {
    const business = await prisma.business.create({ data: { name: 'Rules' } });
    await expect(repository.findByBusinessId(business.id)).resolves.toBeNull();
    await repository.save({ businessId: business.id, pendingBlocksAvailability: false, bufferBeforeDays: 1, bufferAfterDays: 2 });
    await expect(repository.save({ businessId: business.id, pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays: 3 })).resolves.toMatchObject({ pendingBlocksAvailability: true, bufferBeforeDays: 0, bufferAfterDays: 3 });
    await expect(prisma.availabilityRule.count({ where: { businessId: business.id } })).resolves.toBe(1);
  });
});
