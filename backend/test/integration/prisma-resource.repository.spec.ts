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

  it('lista todos los estados con orden sortOrder, name e id en PostgreSQL', async () => {
    const business = await prisma.business.create({ data: { name: 'Business de listado' } });
    const otherBusiness = await prisma.business.create({ data: { name: 'Otro Business' } });
    const third = await prisma.resource.create({ data: { businessId: business.id, name: 'Zulu', internalCode: 'Z', capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 2, status: ResourceStatus.ARCHIVED } });
    const first = await prisma.resource.create({ data: { businessId: business.id, name: 'Alpha', internalCode: 'A', capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 1, status: ResourceStatus.ACTIVE } });
    const second = await prisma.resource.create({ data: { businessId: business.id, name: 'Beta', internalCode: 'B', capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 1, status: ResourceStatus.OUT_OF_SERVICE } });
    await prisma.resource.create({ data: { businessId: otherBusiness.id, name: 'Externo', internalCode: 'EXT', capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 0, status: ResourceStatus.ACTIVE } });
    await expect(repository.listByBusinessId(business.id)).resolves.toMatchObject([{ id: first.id, status: ResourceStatus.ACTIVE }, { id: second.id, status: ResourceStatus.OUT_OF_SERVICE }, { id: third.id, status: ResourceStatus.ARCHIVED }]);
    await expect(repository.listByBusinessId(otherBusiness.id)).resolves.toHaveLength(1);
  });

  it('persiste la deshabilitación sin alterar los demás campos del Resource', async () => {
    const business = await prisma.business.create({ data: { name: 'Business de disable' } });
    const row = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña persistida', internalCode: 'DISABLE-1', description: 'Original', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, sortOrder: 9, status: ResourceStatus.ACTIVE } });
    const original = await repository.findByIdAndBusinessId(row.id, business.id);

    if (!original) throw new Error('El Resource de integración debe existir.');
    const disabled = await repository.update(original.disable());
    const persisted = await prisma.resource.findUniqueOrThrow({ where: { id: row.id } });

    expect(disabled.status).toBe(ResourceStatus.OUT_OF_SERVICE);
    expect(persisted).toMatchObject({ id: row.id, businessId: business.id, name: 'Cabaña persistida', internalCode: 'DISABLE-1', description: 'Original', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, sortOrder: 9, status: ResourceStatus.OUT_OF_SERVICE, createdAt: row.createdAt });
    expect(persisted.updatedAt.getTime()).toBeGreaterThanOrEqual(row.updatedAt.getTime());
  });

  it('persiste la reactivación sin alterar los demás campos del Resource', async () => {
    const business = await prisma.business.create({ data: { name: 'Business de reactivate' } });
    const row = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña reactivada', internalCode: 'REACTIVATE-1', description: 'Original', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, sortOrder: 9, status: ResourceStatus.OUT_OF_SERVICE } });
    const original = await repository.findByIdAndBusinessId(row.id, business.id);

    if (!original) throw new Error('El Resource de integración debe existir.');
    const reactivated = await repository.update(original.reactivate());
    const persisted = await prisma.resource.findUniqueOrThrow({ where: { id: row.id } });

    expect(reactivated.status).toBe(ResourceStatus.ACTIVE);
    expect(persisted).toMatchObject({ id: row.id, businessId: business.id, name: 'Cabaña reactivada', internalCode: 'REACTIVATE-1', description: 'Original', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, sortOrder: 9, status: ResourceStatus.ACTIVE, createdAt: row.createdAt });
    expect(persisted.updatedAt.getTime()).toBeGreaterThan(row.updatedAt.getTime());
  });
});
