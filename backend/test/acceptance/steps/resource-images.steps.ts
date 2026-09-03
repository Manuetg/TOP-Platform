import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { ResourceImage } from '../../../src/modules/resource/domain/resource-image.entity';
import { addResourceImageFake } from '../support/resource-image-repository.fake';
import { acceptanceFileStorage } from '../support/hooks';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const resourceId = '33333333-3333-4333-8333-333333333333';
Given('existe un recurso activo con imágenes ordenables', async function (): Promise<void> { for (const [id, key, sortOrder] of [['11111111-1111-4111-8111-111111111112', 'second.jpg', 1], ['11111111-1111-4111-8111-111111111111', 'first.jpg', 0]] as const) { await acceptanceFileStorage.upload({ key, buffer: Buffer.from(key), mimeType: 'image/jpeg' }); addResourceImageFake(ResourceImage.create({ id, businessId, resourceId, storageKey: key, mimeType: 'image/jpeg', sizeBytes: key.length, sortOrder, createdAt: new Date(), updatedAt: new Date() })); } });
When('consulto sus imágenes', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).get(`/api/businesses/${businessId}/resources/${resourceId}/images`); });
Then('recibo imágenes públicas ordenadas sin storageKey', function (this: TopWorld): void { const body = this.response?.body as Array<{ sortOrder: number; url: string }> | undefined; assert.equal(this.response?.status, 200); assert.ok(body); assert.deepEqual(body.map((image) => image.sortOrder), [0, 1]); assert.equal('storageKey' in body[0], false); assert.equal(typeof body[0].url, 'string'); });
Then('recibo una lista vacía de imágenes', function (this: TopWorld): void { assert.deepEqual(this.response?.body, []); });
