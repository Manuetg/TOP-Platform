import { Amenity } from '../domain/amenity.entity';
import { ListAmenitiesUseCase } from './list-amenities.use-case';

describe('ListAmenitiesUseCase', () => {
  it('returns the active catalog from its repository', async () => {
    const amenity = Amenity.create({ id: '11111111-1111-4111-8111-111111111111', code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active: true, sortOrder: 0, createdAt: new Date(), updatedAt: new Date() });
    const listActive = jest.fn().mockResolvedValue([amenity]);
    const useCase = new ListAmenitiesUseCase({ listActive, findManyByIds: jest.fn() });

    await expect(useCase.execute()).resolves.toEqual([amenity]);
    expect(listActive).toHaveBeenCalledTimes(1);
  });
});
