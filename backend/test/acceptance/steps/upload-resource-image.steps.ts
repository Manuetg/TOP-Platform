import { Given, Then, When } from '@cucumber/cucumber';
import { strict as assert } from 'node:assert';
import request from 'supertest';
import { BusinessStatus } from '../../../src/modules/business/domain/business-status.enum';
import { Resource } from '../../../src/modules/resource/domain/resource.entity';
import { ResourceImage } from '../../../src/modules/resource/domain/resource-image.entity';
import { ResourceStatus } from '../../../src/modules/resource/domain/resource-status.enum';
import { setBusinessStatus } from '../support/business-repository.fake';
import { addResourceFake } from '../support/resource-repository.fake';
import { addResourceImageFake } from '../support/resource-image-repository.fake';
import { TopWorld } from '../support/world';

const businessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0001';
const otherBusinessId = 'f8c49800-e50e-4d0e-b82b-0b51c09a0002';
const resourceId = '66666666-6666-4666-8666-666666666666';

function addImageResource(status: ResourceStatus, owner = businessId): void {
  addResourceFake(Resource.create({
    id: resourceId,
    businessId: owner,
    name: 'Cabaña con imágenes',
    internalCode: 'CAB-IMG',
    description: null,
    capacityMinimum: 1,
    capacityMaximum: 4,
    capacityMaximumChildren: 2,
    status,
    sortOrder: 0,
    createdAt: new Date('2026-08-12T00:00:00.000Z'),
    updatedAt: new Date('2026-08-12T00:00:00.000Z'),
  }));
}

function upload(world: TopWorld, mimeType: string): Promise<request.Response> {
  return request(world.app?.getHttpServer())
    .post(`/api/businesses/${businessId}/resources/${resourceId}/images`)
    .attach('file', Buffer.from([1, 2, 3]), { filename: 'resource-image', contentType: mimeType });
}

Given('existe un recurso activo para cargar imágenes', () => addImageResource(ResourceStatus.ACTIVE));
Given('existe un recurso fuera de servicio para cargar imágenes', () => addImageResource(ResourceStatus.OUT_OF_SERVICE));
Given('existe un recurso archivado para cargar imágenes', () => addImageResource(ResourceStatus.ARCHIVED));
Given('existe un recurso de otro negocio para cargar imágenes', () => addImageResource(ResourceStatus.ACTIVE, otherBusinessId));
Given('el negocio del recurso está archivado', () => setBusinessStatus(businessId, BusinessStatus.ARCHIVED));
Given('existe un recurso con diez imágenes', () => {
  addImageResource(ResourceStatus.ACTIVE);
  for (let sortOrder = 0; sortOrder < 10; sortOrder += 1) {
    addResourceImageFake(ResourceImage.create({
      id: `77777777-7777-4777-8777-${sortOrder.toString().padStart(12, '0')}`,
      businessId,
      resourceId,
      storageKey: `private/${sortOrder}.jpg`,
      mimeType: 'image/jpeg',
      sizeBytes: 1,
      sortOrder,
      createdAt: new Date('2026-08-12T00:00:00.000Z'),
      updatedAt: new Date('2026-08-12T00:00:00.000Z'),
    }));
  }
});

When('cargo una imagen JPEG al recurso', async function (this: TopWorld): Promise<void> { this.response = await upload(this, 'image/jpeg'); });
When('cargo una imagen PNG al recurso', async function (this: TopWorld): Promise<void> { this.response = await upload(this, 'image/png'); });
When('cargo una imagen WEBP al recurso', async function (this: TopWorld): Promise<void> { this.response = await upload(this, 'image/webp'); });
When('cargo una imagen con MIME inválido al recurso', async function (this: TopWorld): Promise<void> { this.response = await upload(this, 'image/svg+xml'); });
When('cargo una solicitud sin archivo al recurso', async function (this: TopWorld): Promise<void> { this.response = await request(this.app?.getHttpServer()).post(`/api/businesses/${businessId}/resources/${resourceId}/images`); });

Then('recibo una imagen pública con URL y orden {int}', function (this: TopWorld, sortOrder: number): void {
  const body = this.response?.body ?? {};
  assert.equal(body.resourceId, resourceId);
  assert.equal(body.sortOrder, sortOrder);
  assert.match(body.url, /^https:\/\/signed\.local\//);
  assert.equal('storageKey' in body, false);
  assert.equal('businessId' in body, false);
  assert.equal('props' in body, false);
});
