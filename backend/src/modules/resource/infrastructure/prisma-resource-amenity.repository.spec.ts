import { PrismaResourceAmenityRepository } from './prisma-resource-amenity.repository';

describe('PrismaResourceAmenityRepository', () => {
  it('replaces associations transactionally and skips createMany for an empty list', async () => {
    const deleteMany = jest.fn().mockResolvedValue({ count: 0 }); const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const transaction = jest.fn((callback: (tx: unknown) => Promise<void>) => callback({ resourceAmenity: { deleteMany, createMany } }));
    const repository = new PrismaResourceAmenityRepository({ $transaction: transaction } as never);
    await repository.replace('11111111-1111-4111-8111-111111111111', ['22222222-2222-4222-8222-222222222222']);
    expect(deleteMany).toHaveBeenCalledWith({ where: { resourceId: '11111111-1111-4111-8111-111111111111' } });
    expect(createMany).toHaveBeenCalledWith({ data: [{ resourceId: '11111111-1111-4111-8111-111111111111', amenityId: '22222222-2222-4222-8222-222222222222' }] });
    await repository.replace('11111111-1111-4111-8111-111111111111', []);
    expect(createMany).toHaveBeenCalledTimes(1);
  });
  it('lists amenities using the exact relation query, mapping and order', async () => {
    const amenity = { id: '22222222-2222-4222-8222-222222222222', code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active: true, sortOrder: 0, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') };
    const findMany = jest.fn().mockResolvedValue([{ resourceId: '11111111-1111-4111-8111-111111111111', amenityId: amenity.id, createdAt: new Date(), amenity }]);
    const repository = new PrismaResourceAmenityRepository({ resourceAmenity: { findMany } } as never);
    const result = await repository.listByResourceId('11111111-1111-4111-8111-111111111111');
    expect(result.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category, active: item.active, sortOrder: item.sortOrder, createdAt: item.createdAt, updatedAt: item.updatedAt }))).toEqual([amenity]);
    expect(findMany).toHaveBeenCalledWith({ where: { resourceId: '11111111-1111-4111-8111-111111111111' }, include: { amenity: true }, orderBy: [{ amenity: { category: 'asc' } }, { amenity: { sortOrder: 'asc' } }, { amenity: { name: 'asc' } }, { amenityId: 'asc' }] });
  });
});
