import { PrismaClient } from '@prisma/client';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('PrismaResourceRepository con PostgreSQL', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaResourceRepository(prisma);

  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });

  it.each([ResourceStatus.ACTIVE, ResourceStatus.OUT_OF_SERVICE, ResourceStatus.ARCHIVED])(
    'recupera un Resource %s con el mapeo completo y respeta el tenant',
    async (status) => {
      const firstBusiness = await prisma.business.create({ data: { name: 'Business Resource A' } });
      const secondBusiness = await prisma.business.create({ data: { name: 'Business Resource B' } });
      const row = await prisma.resource.create({ data: { businessId: firstBusiness.id, name: 'Cabaña A', internalCode: `CODE-${status}`, description: 'Vista al lago', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 8 } });

      await expect(repository.findByIdAndBusinessId(row.id, firstBusiness.id)).resolves.toMatchObject({ id: row.id, businessId: firstBusiness.id, name: 'Cabaña A', internalCode: `CODE-${status}`, description: 'Vista al lago', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 8, createdAt: row.createdAt, updatedAt: row.updatedAt });
      await expect(repository.findByIdAndBusinessId(row.id, secondBusiness.id)).resolves.toBeNull();
      await expect(repository.findByIdAndBusinessId('11111111-1111-4111-8111-111111111111', firstBusiness.id)).resolves.toBeNull();
    },
  );
});
