import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { addResourceFake } from '../support/resource-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const resourceId = '88888888-8888-4888-8888-888888888888';
const addResource = (status: ResourceStatus, owner = businessId): void => addResourceFake(Resource.create({ id: resourceId, businessId: owner, name: 'Cabaña', internalCode: 'CAB-REA', description: 'Vista', capacityMinimum: 1, capacityMaximum: 4, capacityMaximumChildren: 2, status, sortOrder: 3, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') }));

Given('existe un recurso fuera de servicio para reactivar', () => addResource(ResourceStatus.OUT_OF_SERVICE));
Given('existe un recurso archivado para reactivar', () => addResource(ResourceStatus.ARCHIVED));
Given('existe un recurso de otro negocio para reactivar', () => addResource(ResourceStatus.OUT_OF_SERVICE, otherBusinessId));
When('reactivo el recurso', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/resources/${resourceId}/reactivate`); });
When('reactivo el recurso nuevamente', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).patch(`/api/businesses/${businessId}/resources/${resourceId}/reactivate`); });
Then('el recurso queda activo sin propiedades internas', function (this: TopWorld): void { assert.equal(this.response?.body.status, ResourceStatus.ACTIVE); assert.equal('props' in (this.response?.body ?? {}), false); assert.equal(this.response?.body.name, 'Cabaña'); assert.equal(this.response?.body.capacityMaximum, 4); });
