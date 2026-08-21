import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { BlockType } from '../../../src/modules/block/domain/block-type.enum';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { blockRepositoryFake } from '../support/block-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001'; const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002'; const resourceId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0003';
Given('existe un Resource activo para Block', function (): void { addResourceFake(Resource.create({ id: resourceId, businessId, name: 'Cabaña', internalCode: 'B01', description: null, capacityMinimum: 1, capacityMaximum: 2, capacityMaximumChildren: 0, status: ResourceStatus.ACTIVE, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() })); });
When('creo un Block programado', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/resources/${resourceId}/blocks`).send({ type: BlockType.MAINTENANCE, reason: 'Mantenimiento', startsAt: '2030-12-20T10:00:00-03:00', endsAt: '2030-12-21T10:00:00-03:00' }); this.blockId = this.response.body.id as string; });
When('listo los Blocks del negocio', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessId}/blocks`); });
Then('recibo un Block público programado', function (this: TopWorld): void { assert.ok(this.response); assert.ok(Array.isArray(this.response.body)); const block = this.response.body[0] as Record<string, unknown>; assert.equal(block.status, 'SCHEDULED'); assert.equal('props' in block, false); });
When('cancelo el Block creado', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/blocks/${this.blockId}/cancel`).send({ reason: 'Cambio' }); });
Then('recibo un Block público cancelado', function (this: TopWorld): void { assert.equal(this.response?.body.status, 'CANCELLED'); assert.equal(this.response?.body.cancellationReason, 'Cambio'); });
Given('existe un Block en otro negocio', async function (this: TopWorld): Promise<void> { const block = await blockRepositoryFake.create({ businessId: otherBusinessId, resourceId, type: BlockType.OTHER, reason: 'Uso propio', notes: null, startsAt: new Date('2030-12-20T13:00:00Z'), endsAt: new Date('2030-12-21T13:00:00Z') }); this.blockId = block.id; });
When('intento cancelar el Block de otro negocio', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/blocks/${this.blockId}/cancel`).send({ reason: 'Cambio' }); });
