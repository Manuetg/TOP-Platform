import { PrismaClient } from '@prisma/client';
import { PrismaBusinessRepository } from '../../src/modules/business/infrastructure/prisma-business.repository';
import { UpdateRatePlanUseCase } from '../../src/modules/pricing/application/update-rate-plan.use-case';
import { CalculatePriceUseCase } from '../../src/modules/pricing/application/calculate-price.use-case';
import { PricingCalculator } from '../../src/modules/pricing/domain/pricing-calculator';
import { PrismaRatePlanRepository } from '../../src/modules/pricing/infrastructure/prisma-rate-plan.repository';
import { PrismaSeasonalRateRepository } from '../../src/modules/pricing/infrastructure/prisma-seasonal-rate.repository';
import { PrismaResourceRepository } from '../../src/modules/resource/infrastructure/prisma-resource.repository';
import { ResourceStatus } from '../../src/modules/resource/domain/resource-status.enum';
import { cleanTestDatabase } from './support/clean-test-database';

const databaseUrl = process.env.DATABASE_URL;
const describeWithPostgres = databaseUrl?.includes('test') ? describe : describe.skip;
describeWithPostgres('PrismaRatePlanRepository', () => {
  const prisma = new PrismaClient(); const repository = new PrismaRatePlanRepository(prisma); const seasons = new PrismaSeasonalRateRepository(prisma);
  const update = new UpdateRatePlanUseCase(new PrismaBusinessRepository(prisma), new PrismaResourceRepository(prisma), repository, seasons);
  const calculate = new CalculatePriceUseCase(new PrismaBusinessRepository(prisma), new PrismaResourceRepository(prisma), repository, repository, seasons, new PricingCalculator());
  beforeAll(async () => prisma.$connect()); beforeEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterEach(async () => cleanTestDatabase(prisma, databaseUrl)); afterAll(async () => { await cleanTestDatabase(prisma, databaseUrl); await prisma.$disconnect(); });
  async function fixture() {
    const business = await prisma.business.create({ data: { name: 'Pricing' } });
    const resources = await Promise.all(['ONE', 'TWO', 'THREE'].map((internalCode, index) => prisma.resource.create({ data: { businessId: business.id, name: internalCode, internalCode, capacityMaximum: 2, status: index === 2 ? ResourceStatus.OUT_OF_SERVICE : ResourceStatus.ACTIVE } })));
    const plan = await repository.create({ businessId: business.id, name: 'Standard', description: 'Initial', baseNightlyAmountMinor: 450000, currency: 'PYG', validFrom: '2026-12-20', validTo: '2027-01-06', resourceIds: [resources[0].id, resources[1].id] });
    return { business, resources, plan };
  }
  async function persisted(id: string) { return prisma.ratePlan.findUniqueOrThrow({ where: { id }, include: { resources: true } }); }
  it('crea atómicamente un plan con Resources y tarifa base', async () => { const { business, resources, plan } = await fixture(); const saved = await persisted(plan.id); expect(plan).toMatchObject({ businessId: business.id, currency: 'PYG', baseNightlyAmountMinor: 450000 }); expect(saved.resources.map((item) => item.resourceId).sort()).toEqual([resources[0].id, resources[1].id].sort()); });
  it('preserva relaciones si resourceIds es undefined y las reemplaza o vacía cuando está presente', async () => { const { resources, plan } = await fixture(); await repository.update({ id: plan.id, businessId: plan.businessId, name: 'Updated', description: null, baseNightlyAmountMinor: 500000, currency: 'PYG', validFrom: null, validTo: plan.validTo, resourceIds: undefined }); let saved = await persisted(plan.id); expect(saved.resources.map((item) => item.resourceId).sort()).toEqual([resources[0].id, resources[1].id].sort()); await repository.update({ id: plan.id, businessId: plan.businessId, name: 'Updated', description: null, baseNightlyAmountMinor: 500000, currency: 'PYG', validFrom: null, validTo: null, resourceIds: [resources[1].id, resources[2].id] }); saved = await persisted(plan.id); expect(saved.resources.map((item) => item.resourceId).sort()).toEqual([resources[1].id, resources[2].id].sort()); await repository.update({ id: plan.id, businessId: plan.businessId, name: 'Updated', description: null, baseNightlyAmountMinor: 500000, currency: 'PYG', validFrom: null, validTo: null, resourceIds: [] }); expect((await persisted(plan.id)).resources).toHaveLength(0); });
  it('permite Resource OUT_OF_SERVICE y oculta Resources de otro Business', async () => { const { business, resources, plan } = await fixture(); await expect(update.execute({ businessId: business.id, ratePlanId: plan.id, resourceIds: [resources[2].id] })).resolves.toMatchObject({ resources: [{ id: resources[2].id }] }); const other = await prisma.business.create({ data: { name: 'Other' } }); const foreign = await prisma.resource.create({ data: { businessId: other.id, name: 'Foreign', internalCode: 'FOREIGN', capacityMaximum: 2 } }); await expect(update.execute({ businessId: business.id, ratePlanId: plan.id, resourceIds: [foreign.id] })).rejects.toThrow('El recurso no existe.'); expect((await persisted(plan.id)).resources.map((item) => item.resourceId)).toEqual([resources[2].id]); });
  it('rejects archived Resources without partial updates or relations', async () => { const { business, resources, plan } = await fixture(); const archived = await prisma.resource.create({ data: { businessId: business.id, name: 'Archived', internalCode: 'ARCHIVED', capacityMaximum: 2, status: ResourceStatus.ARCHIVED } }); await expect(update.execute({ businessId: business.id, ratePlanId: plan.id, baseNightlyAmountMinor: 500000, resourceIds: [resources[1].id, archived.id] })).rejects.toThrow('El recurso está archivado.'); const saved = await persisted(plan.id); expect(saved.baseNightlyAmountMinor).toBe(450000); expect(saved.resources.map((item) => item.resourceId).sort()).toEqual([resources[0].id, resources[1].id].sort()); expect(saved.resources.some((item) => item.resourceId === archived.id)).toBe(false); });
  it('protects existing seasons when reducing validity and preserves the RatePlan atomically', async () => {
    const { resources, plan } = await fixture();
    await seasons.create({ ratePlanId: plan.id, name: 'Navidad', amountMinor: 650000, startDate: '2026-12-20', endDate: '2027-01-06', currency: 'PYG' });
    await expect(update.execute({ businessId: plan.businessId, ratePlanId: plan.id, validTo: '2027-01-01' })).rejects.toThrow('no puede excluir temporadas');
    await expect(update.execute({ businessId: plan.businessId, ratePlanId: plan.id, validFrom: '2026-12-25' })).rejects.toThrow('no puede excluir temporadas');
    await expect(update.execute({ businessId: plan.businessId, ratePlanId: plan.id, baseNightlyAmountMinor: 500000, validTo: '2027-01-01', resourceIds: [resources[2].id] })).rejects.toThrow('no puede excluir temporadas');
    const unchanged = await persisted(plan.id);
    expect(unchanged).toMatchObject({ baseNightlyAmountMinor: 450000, validFrom: new Date('2026-12-20T00:00:00.000Z'), validTo: new Date('2027-01-06T00:00:00.000Z') });
    expect(unchanged.resources.map((item) => item.resourceId).sort()).toEqual([resources[0].id, resources[1].id].sort());
    expect(await prisma.seasonalRate.findMany({ where: { ratePlanId: plan.id } })).toHaveLength(1);
  });
  it('allows expanding or clearing validity without changing existing seasons', async () => {
    const { plan } = await fixture();
    await seasons.create({ ratePlanId: plan.id, name: 'Navidad', amountMinor: 650000, startDate: '2026-12-20', endDate: '2027-01-06', currency: 'PYG' });
    await expect(update.execute({ businessId: plan.businessId, ratePlanId: plan.id, validFrom: '2026-12-01', validTo: '2027-01-31' })).resolves.toMatchObject({ validFrom: '2026-12-01', validTo: '2027-01-31' });
    await expect(update.execute({ businessId: plan.businessId, ratePlanId: plan.id, validTo: null })).resolves.toMatchObject({ validTo: null });
  });
  it('calculates only assigned Resources with exactly intersecting seasonal rates and persists nothing', async () => {
    const { resources, plan } = await fixture();
    await seasons.create({ ratePlanId: plan.id, name: 'Navidad', amountMinor: 650000, startDate: '2026-12-20', endDate: '2026-12-22', currency: 'PYG' });
    await seasons.create({ ratePlanId: plan.id, name: 'Antes', amountMinor: 900000, startDate: '2026-12-18', endDate: '2026-12-20', currency: 'PYG' });
    await seasons.create({ ratePlanId: plan.id, name: 'Después', amountMinor: 900000, startDate: '2026-12-24', endDate: '2026-12-26', currency: 'PYG' });
    const calculated = await calculate.execute({ businessId: plan.businessId, ratePlanId: plan.id, resourceId: resources[0].id, checkIn: '2026-12-20', checkOut: '2026-12-24' });
    expect(calculated).toMatchObject({ nights: 4, totalAmountMinor: 2200000 });
    expect(calculated.breakdown.map((night) => night.amountMinor)).toEqual([650000, 650000, 450000, 450000]);
    const unassigned = await prisma.resource.create({ data: { businessId: plan.businessId, name: 'FOUR', internalCode: 'FOUR', capacityMaximum: 2 } });
    await expect(calculate.execute({ businessId: plan.businessId, ratePlanId: plan.id, resourceId: unassigned.id, checkIn: '2026-12-20', checkOut: '2026-12-24' })).rejects.toThrow('no está asignada');
    expect(await prisma.ratePlan.count()).toBe(1); expect(await prisma.ratePlanResource.count()).toBe(2);
  });
});
