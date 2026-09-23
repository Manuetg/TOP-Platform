import { PrismaClient } from '@prisma/client';
import { PrismaSubscriptionRepository } from '../../src/modules/subscription/infrastructure/prisma-subscription.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { ResourceLimitReachedError } from '../../src/modules/subscription/subscription.contract';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl ? describe : describe.skip;
describeWithPostgres('Subscription y alta atómica con PostgreSQL', () => {
  const prisma = new PrismaClient(); const quota = new PrismaSubscriptionRepository(prisma); const resources = new PrismaResourceRepository(prisma);
  beforeAll(() => prisma.$connect());
  beforeEach(() => cleanTestDatabase(prisma, databaseUrl));
  afterEach(() => cleanTestDatabase(prisma, databaseUrl));
  afterAll(() => prisma.$disconnect());
  const input = (businessId: string, code: string) => ({ businessId, name: code, internalCode: code, description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 0 });
  const create = (businessId: string, code: string) => quota.allocate(businessId, (maximum, transaction) => resources.create(input(businessId, code), { maximum, transaction }));

  it('asigna plan persistido a negocios nuevos y separa tenants', async () => {
    const a = await prisma.business.create({ data: { name: 'A' } }); const b = await prisma.business.create({ data: { name: 'B' } });
    expect((await quota.get(a.id)).plan).toMatchObject({ code: 'TOP_INITIAL', maxResources: 10 });
    await create(a.id, 'A1'); expect(await resources.countOperational(a.id)).toBe(1); expect(await resources.countOperational(b.id)).toBe(0);
    expect(await prisma.businessSubscription.count({ where: { businessId: a.id } })).toBe(1);
  });
  it('serializa dos altas para el último lugar y no supera el cupo', async () => {
    const business = await prisma.business.create({ data: { name: 'Concurrente' } });
    await prisma.resource.createMany({ data: Array.from({ length: 9 }, (_, i) => input(business.id, `BASE-${i}`)) });
    const results = await Promise.allSettled([create(business.id, 'LAST-A'), create(business.id, 'LAST-B')]);
    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    const failed = results.find((item) => item.status === 'rejected') as PromiseRejectedResult;
    expect(failed.reason).toBeInstanceOf(ResourceLimitReachedError); expect(await resources.countOperational(business.id)).toBe(10);
  });
  it('cuenta fuera de servicio, excluye archivados y permite inventario previo superior al cupo solo en lectura', async () => {
    const business = await prisma.business.create({ data: { name: 'Estados' } });
    await prisma.resource.createMany({ data: Array.from({ length: 11 }, (_, i) => ({ ...input(business.id, `OLD-${i}`), status: 'OUT_OF_SERVICE' as const })) });
    await prisma.resource.create({ data: { ...input(business.id, 'ARCHIVED'), status: 'ARCHIVED' } });
    expect(await resources.countOperational(business.id)).toBe(11); await expect(create(business.id, 'NEW')).rejects.toBeInstanceOf(ResourceLimitReachedError);
    expect(await prisma.resource.count({ where: { businessId: business.id } })).toBe(12);
  });
  it('rollback no consume cupo ni deja asignación parcial', async () => {
    const business = await prisma.business.create({ data: { name: 'Rollback' } });
    await expect(quota.allocate(business.id, async (maximum, transaction) => { await resources.create(input(business.id, 'FAILED'), { maximum, transaction }); throw new Error('fallo controlado'); })).rejects.toThrow('fallo controlado');
    expect(await resources.countOperational(business.id)).toBe(0); expect(await prisma.businessSubscription.findUnique({ where: { businessId: business.id } })).toBeNull();
  });
  it('solicitudes simultáneas conservan primera fecha/actor sin modificar plan ni cupo', async () => {
    const business = await prisma.business.create({ data: { name: 'Solicitud' } });
    const [first, repeated] = await Promise.all([quota.requestUpgrade(business.id, 'actor-a'), quota.requestUpgrade(business.id, 'actor-b')]);
    expect(first.upgradeRequestedAt).toEqual(repeated.upgradeRequestedAt); expect(first.plan.maxResources).toBe(10);
    const stored = await prisma.businessSubscription.findUniqueOrThrow({ where: { businessId: business.id } });
    expect(['actor-a', 'actor-b']).toContain(stored.upgradeRequestedBy); expect(stored.planCode).toBe('TOP_INITIAL');
  });
});
