import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { archiveRatePlanFake } from '../support/rate-plan-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001'; const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const oneId = '11111111-1111-4111-8111-111111111111'; const twoId = '22222222-2222-4222-8222-222222222222'; const threeId = '33333333-3333-4333-8333-333333333333';
function planId(world: TopWorld): string { return world.ratePlanId ?? (world.response?.body.id as string); }
function addResource(id: string, status = ResourceStatus.ACTIVE, owner = businessId): void { addResourceFake(Resource.create({ id, businessId: owner, name: `Resource ${id.slice(0, 1)}`, internalCode: `RES-${id.slice(0, 1)}`, description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, sortOrder: 0, status, createdAt: new Date(), updatedAt: new Date() })); }
async function createPlan(world: TopWorld, resourceIds: string[] = []): Promise<void> { world.response = await request(world.app?.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans`).send({ name: 'Tarifa estándar', description: 'Inicial', baseNightlyAmountMinor: 450000, validFrom: '2026-08-01', validTo: '2026-09-01', resourceIds }); assert.equal(world.response.status, 201); world.ratePlanId = world.response.body.id as string; }

When('creo una tarifa base sin Resources', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans`).send({ name: 'Tarifa estándar', baseNightlyAmountMinor: 450000, resourceIds: [] }); });
Then('recibo la tarifa pública en PYG', function (this: TopWorld): void { assert.equal(this.response?.body.currency, 'PYG'); assert.equal(this.response?.body.baseNightlyAmountMinor, 450000); assert.equal('props' in (this.response?.body ?? {}), false); });
Given('existe una tarifa base activa', async function (this: TopWorld): Promise<void> { await createPlan(this); });
Given('existe una tarifa archivada', async function (this: TopWorld): Promise<void> { await createPlan(this); archiveRatePlanFake(planId(this)); });
Given('una tarifa tiene Resource uno y Resource dos', async function (this: TopWorld): Promise<void> { addResource(oneId); addResource(twoId); addResource(threeId); await createPlan(this, [oneId, twoId]); });
Given('un Resource está fuera de servicio', function (): void { addResource(threeId, ResourceStatus.OUT_OF_SERVICE); });
Given('un Resource está archivado', function (): void { addResource(threeId, ResourceStatus.ARCHIVED); });
Given('existe un Resource de otro negocio', function (): void { addResource(threeId, ResourceStatus.ACTIVE, otherBusinessId); });
When('actualizo el importe de la tarifa', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ baseNightlyAmountMinor: 500000 }); });
When('limpio la descripción y la vigencia de la tarifa', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ description: null, validFrom: null, validTo: null }); });
When('reemplazo sus Resources por una lista vacía', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ resourceIds: [] }); });
When('reemplazo sus Resources por Resource dos y Resource tres', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ resourceIds: [twoId, threeId] }); });
When('asigno el Resource fuera de servicio', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ resourceIds: [threeId] }); });
When('intento asignar el Resource archivado', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ resourceIds: [threeId] }); });
When('actualizo la tarifa desde otro negocio', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${otherBusinessId}/rate-plans/${planId(this)}`).send({ baseNightlyAmountMinor: 500000 }); });
When('intento asignar el Resource de otro negocio', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ resourceIds: [threeId] }); });
Then('la tarifa mantiene los campos omitidos', function (this: TopWorld): void { assert.equal(this.response?.body.name, 'Tarifa estándar'); assert.equal(this.response?.body.baseNightlyAmountMinor, 500000); assert.equal(this.response?.body.description, 'Inicial'); });
Then('la descripción y la vigencia quedan vacías', function (this: TopWorld): void { assert.equal(this.response?.body.description, null); assert.equal(this.response?.body.validFrom, null); assert.equal(this.response?.body.validTo, null); });
Then('la tarifa conserva una lista de Resources vacía', function (this: TopWorld): void { assert.deepEqual(this.response?.body.resources, []); });
Then('la tarifa queda solo con Resource dos y Resource tres', function (this: TopWorld): void { assert.deepEqual(this.response?.body.resources.map((item: { id: string }) => item.id), [twoId, threeId]); });
Then('la tarifa se actualiza con éxito', function (this: TopWorld): void { assert.equal(this.response?.status, 200); });
Then('la tarifa permanece sin cambios', function (this: TopWorld): void { assert.equal(this.response?.body.message, 'El recurso está archivado.'); });

async function createSeason(world: TopWorld, body: Record<string, unknown>, owner = businessId): Promise<void> {
  world.response = await request(world.app?.getHttpServer()).post(`/api/businesses/${owner}/rate-plans/${planId(world)}/seasonal-rates`).send(body);
}

Given('existe una temporada Navidad', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-25' }); assert.equal(this.response?.status, 201); });
Given('existen dos temporadas contiguas', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-25' }); await createSeason(this, { name: 'Año nuevo', amountMinor: 700000, startDate: '2026-08-25', endDate: '2026-08-30' }); });
When('creo la temporada Navidad', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-25' }); });
When('creo una temporada contigua', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Año nuevo', amountMinor: 700000, startDate: '2026-08-25', endDate: '2026-08-30' }); });
When('intento crear una temporada solapada', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Solapada', amountMinor: 700000, startDate: '2026-08-24', endDate: '2026-08-30' }); });
When('intento crear una temporada fuera de vigencia', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Fuera', amountMinor: 700000, startDate: '2026-07-30', endDate: '2026-08-02' }); });
When('creo una temporada desde otro negocio', async function (this: TopWorld): Promise<void> { await createSeason(this, { name: 'Navidad', amountMinor: 650000, startDate: '2026-08-20', endDate: '2026-08-25' }, otherBusinessId); });
When('listo las temporadas de la tarifa', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessId}/rate-plans/${planId(this)}/seasonal-rates`); });
When('cotizo cuatro noches para Resource uno', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId(this)}/calculate`).send({ resourceId: oneId, checkIn: '2026-08-10', checkOut: '2026-08-14' }); });
When('cotizo para Resource tres no asignado', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId(this)}/calculate`).send({ resourceId: threeId, checkIn: '2026-08-10', checkOut: '2026-08-14' }); });
When('aplico un precio manual de {int} a Resource uno', async function (this: TopWorld, agreedAmountMinor: number): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/rate-plans/${planId(this)}/calculate/override`).send({ resourceId: oneId, checkIn: '2026-08-10', checkOut: '2026-08-14', agreedAmountMinor, overrideReason: 'Descuento comercial' }); });
Then('recibo cuatro noches con tarifa base', function (this: TopWorld): void { assert.equal(this.response?.body.nights, 4); assert.equal(this.response?.body.totalAmountMinor, 1800000); assert.deepEqual(this.response?.body.breakdown.map((night: { source: string }) => night.source), ['BASE', 'BASE', 'BASE', 'BASE']); assert.equal('props' in (this.response?.body ?? {}), false); });
Then('recibo el precio manual público con el desglose sugerido', function (this: TopWorld): void { assert.equal(this.response?.body.pricingMode, 'MANUAL_OVERRIDE'); assert.equal(this.response?.body.suggestedAmountMinor, 1800000); assert.equal(this.response?.body.agreedAmountMinor, 1600000); assert.equal(this.response?.body.adjustmentAmountMinor, -200000); assert.deepEqual(this.response?.body.suggestedBreakdown.map((night: { source: string }) => night.source), ['BASE', 'BASE', 'BASE', 'BASE']); assert.equal('props' in (this.response?.body ?? {}), false); });
When('reduzco la vigencia final de la tarifa', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/rate-plans/${planId(this)}`).send({ validTo: '2026-08-24' }); });
Then('recibo la temporada pública Navidad', function (this: TopWorld): void { assert.equal(this.response?.body.name, 'Navidad'); assert.equal(this.response?.body.currency, 'PYG'); assert.equal('props' in (this.response?.body ?? {}), false); });
Then('recibo las temporadas en orden', function (this: TopWorld): void { assert.deepEqual(this.response?.body.map((rate: { name: string }) => rate.name), ['Navidad', 'Año nuevo']); });
