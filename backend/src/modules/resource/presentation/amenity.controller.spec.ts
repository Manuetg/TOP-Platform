import { Amenity } from '../domain/amenity.entity';
import { AmenityController } from './amenity.controller';

describe('AmenityController', () => {
  it('delegates once and maps the public catalog exactly', async () => {
    const items = [Amenity.create({ id: '11111111-1111-4111-8111-111111111111', code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() })];
    const execute = jest.fn().mockResolvedValue(items);
    const controller = new AmenityController({ execute } as never);
    await expect(controller.list()).resolves.toEqual([{ id: items[0].id, code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', sortOrder: 0 }]);
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it('propagates errors from the use case', async () => {
    const controller = new AmenityController({ execute: jest.fn().mockRejectedValue(new Error('failure')) } as never);
    await expect(controller.list()).rejects.toThrow('failure');
  });
});
