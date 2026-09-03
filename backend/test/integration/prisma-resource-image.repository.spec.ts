import { PrismaClient } from '@prisma/client';
import { PrismaResourceImageRepository } from '../../src/modules/resource/infrastructure/prisma-resource-image.repository';
import { ResourceImage } from '../../src/modules/resource/domain/resource-image.entity';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('PrismaResourceImageRepository con PostgreSQL', () => {
  const prisma = new PrismaClient();
  const repository = new PrismaResourceImageRepository(prisma);
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterEach(async () => { await cleanTestDatabase(prisma, databaseUrl); });
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  it('persiste metadata, respeta relaciones y calcula órdenes consecutivos', async () => {
    const business = await prisma.business.create({ data: { name: 'Business imágenes' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabaña', internalCode: 'IMG-1', capacityMaximum: 2 } });
    const first = ResourceImage.create({ id: '11111111-1111-4111-8111-111111111111', businessId: business.id, resourceId: resource.id, storageKey: 'first.jpg', mimeType: 'image/jpeg', sizeBytes: 10, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    await repository.create(first);
    expect(await repository.countByResourceId(resource.id)).toBe(1);
    expect(await repository.getNextSortOrder(resource.id)).toBe(1);
    await expect(prisma.resourceImage.findUniqueOrThrow({ where: { resourceId_sortOrder: { resourceId: resource.id, sortOrder: 0 } } })).resolves.toMatchObject({ businessId: business.id, storageKey: 'first.jpg' });
  });
  it('lista solo imágenes del Resource ordenadas por sortOrder e id', async () => {
    const business = await prisma.business.create({ data: { name: 'Business lista imágenes' } });
    const firstResource = await prisma.resource.create({ data: { businessId: business.id, name: 'Uno', internalCode: 'IMG-L1', capacityMaximum: 2 } });
    const secondResource = await prisma.resource.create({ data: { businessId: business.id, name: 'Dos', internalCode: 'IMG-L2', capacityMaximum: 2 } });
    await prisma.resourceImage.createMany({ data: [{ id: '11111111-1111-4111-8111-111111111112', businessId: business.id, resourceId: firstResource.id, storageKey: 'b.jpg', mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: 1 }, { id: '11111111-1111-4111-8111-111111111111', businessId: business.id, resourceId: firstResource.id, storageKey: 'a.jpg', mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: 0 }, { id: '11111111-1111-4111-8111-111111111113', businessId: business.id, resourceId: secondResource.id, storageKey: 'other.jpg', mimeType: 'image/jpeg', sizeBytes: 1, sortOrder: 0 }] });
    await expect(repository.listByResourceId(firstResource.id)).resolves.toMatchObject([{ storageKey: 'a.jpg', sortOrder: 0 }, { storageKey: 'b.jpg', sortOrder: 1 }]);
    await expect(repository.listByResourceId('22222222-2222-4222-8222-222222222222')).resolves.toEqual([]);
  });
});
