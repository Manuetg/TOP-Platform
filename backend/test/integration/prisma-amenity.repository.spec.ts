import { PrismaClient } from '@prisma/client';
import { PrismaAmenityRepository } from '../../src/modules/resource/infrastructure/prisma-amenity.repository';
import { PrismaResourceAmenityRepository } from '../../src/modules/resource/infrastructure/prisma-resource-amenity.repository';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;

describeWithPostgres('Amenities con PostgreSQL', () => {
  const prisma = new PrismaClient();
  const amenities = new PrismaAmenityRepository(prisma);
  const resourceAmenities = new PrismaResourceAmenityRepository(prisma);
  let createdAmenityIds: string[] = [];
  beforeAll(async () => { await prisma.$connect(); });
  beforeEach(async () => { createdAmenityIds = []; await cleanTestDatabase(prisma, databaseUrl); });
  afterEach(async () => {
    await cleanTestDatabase(prisma, databaseUrl);
    await prisma.amenity.deleteMany({ where: { id: { in: createdAmenityIds } } });
  });
  afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.amenity.deleteMany({ where: { id: { in: createdAmenityIds } } }); await prisma.$disconnect(); });

  it('lista solo activas ordenadas y reemplaza relaciones de forma atómica', async () => {
    const suffix = crypto.randomUUID();
    const active = await prisma.amenity.create({ data: { code: `WIFI-${suffix}`, name: 'Wi-Fi', category: 'CONNECTIVITY', sortOrder: 1 } });
    const second = await prisma.amenity.create({ data: { code: `TV-${suffix}`, name: 'TV', category: 'ENTERTAINMENT', sortOrder: 0 } });
    const inactive = await prisma.amenity.create({ data: { code: `OLD-${suffix}`, name: 'Vieja', category: 'GENERAL', sortOrder: 0, active: false } });
    createdAmenityIds = [active.id, second.id, inactive.id];
    const business = await prisma.business.create({ data: { name: 'Amenities test' } });
    const resource = await prisma.resource.create({ data: { businessId: business.id, name: 'Cabana', internalCode: 'AMENITY', capacityMaximum: 2 } });
    await expect(amenities.listActive()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: active.id }), expect.objectContaining({ id: second.id })]));
    await resourceAmenities.replace(resource.id, [active.id, second.id]);
    await expect(resourceAmenities.listByResourceId(resource.id)).resolves.toHaveLength(2);
    await resourceAmenities.replace(resource.id, [second.id]);
    await expect(resourceAmenities.listByResourceId(resource.id)).resolves.toEqual([expect.objectContaining({ id: second.id })]);
    await resourceAmenities.replace(resource.id, []);
    await expect(resourceAmenities.listByResourceId(resource.id)).resolves.toEqual([]);
  });
});
