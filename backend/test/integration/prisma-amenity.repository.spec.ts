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

  it('combina globales y customs del Business sin filtrar otro tenant y persiste asignaciones', async () => {
    const suffix = crypto.randomUUID();
    const businessA = await prisma.business.create({ data: { name: `Amenities A ${suffix}` } });
    const businessB = await prisma.business.create({ data: { name: `Amenities B ${suffix}` } });
    const global = await prisma.amenity.create({ data: { code: `GLOBAL-${suffix}`, name: 'Global', category: 'GENERAL', sortOrder: 0 } });
    const customA = await prisma.amenity.create({ data: { code: `CUSTOM-A-${suffix}`, businessId: businessA.id, name: 'Amanecer', category: 'GENERAL', sortOrder: 1 } });
    const customB = await prisma.amenity.create({ data: { code: `CUSTOM-B-${suffix}`, businessId: businessB.id, name: 'Brisa', category: 'GENERAL', sortOrder: 1 } });
    const resource = await prisma.resource.create({ data: { businessId: businessA.id, name: 'Cabaña', internalCode: `AM-${suffix}`, capacityMaximum: 2 } });

    await expect(amenities.listActive()).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: global.id, businessId: null })]));
    await expect(amenities.listActive()).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: customA.id })]));
    await expect(amenities.listActiveForBusiness(businessA.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: global.id, businessId: null }), expect.objectContaining({ id: customA.id, businessId: businessA.id })]));
    await expect(amenities.listActiveForBusiness(businessA.id)).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: customB.id })]));

    await resourceAmenities.replace(resource.id, [global.id, customA.id]);
    await expect(resourceAmenities.listByResourceId(resource.id)).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: global.id }), expect.objectContaining({ id: customA.id, businessId: businessA.id })]));
  });
});
