import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const resourceId = '55555555-5555-4555-8555-555555555555';
const addResource = (status: ResourceStatus, owner = businessId): void => addResourceFake(Resource.create({ id: resourceId, businessId: owner, name: 'Cabaña', internalCode: 'CAB-DIS', description: 'Vista', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 3, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') }));

Given('existe un recurso activo para deshabilitar', () => addResource(ResourceStatus.ACTIVE));
Given('existe un recurso archivado para deshabilitar', () => addResource(ResourceStatus.ARCHIVED));
Given('existe un recurso de otro negocio para deshabilitar', () => addResource(ResourceStatus.ACTIVE, otherBusinessId));
When('deshabilito el recurso', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/resources/${resourceId}/disable`); });
When('deshabilito el recurso nuevamente', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/resources/${resourceId}/disable`); });
Then('el recurso queda fuera de servicio sin propiedades internas', function (this: TopWorld): void { assert.equal(this.response?.body.status, ResourceStatus.OUT_OF_SERVICE); assert.equal('props' in (this.response?.body ?? {}), false); assert.equal(this.response?.body.name, 'Cabaña'); assert.equal(this.response?.body.capacityMaximum, 4); });
