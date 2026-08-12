import { ResourceImage } from './resource-image.entity';

describe('ResourceImage', () => {
  it('expone todos los valores persistidos sin estructuras internas', () => {
    const createdAt = new Date('2026-08-12T00:00:00.000Z'); const updatedAt = new Date('2026-08-12T01:00:00.000Z');
    const image = ResourceImage.create({ id: 'image-id', businessId: 'business-id', resourceId: 'resource-id', storageKey: 'private/key.jpg', mimeType: 'image/jpeg', sizeBytes: 123, sortOrder: 4, createdAt, updatedAt });
    expect({ id: image.id, businessId: image.businessId, resourceId: image.resourceId, storageKey: image.storageKey, mimeType: image.mimeType, sizeBytes: image.sizeBytes, sortOrder: image.sortOrder, createdAt: image.createdAt, updatedAt: image.updatedAt }).toEqual({ id: 'image-id', businessId: 'business-id', resourceId: 'resource-id', storageKey: 'private/key.jpg', mimeType: 'image/jpeg', sizeBytes: 123, sortOrder: 4, createdAt, updatedAt });
  });
});
