import { PrismaAmenityRepository } from './prisma-amenity.repository';

describe('PrismaAmenityRepository', () => {
  it('queries active amenities with the public deterministic order and maps them', async () => {
    const findMany = jest.fn().mockResolvedValue([{ id: '11111111-1111-4111-8111-111111111111', code: 'WIFI', name: 'Wi-Fi', category: 'CONNECTIVITY', active: true, sortOrder: 0, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') }]);
    const repository = new PrismaAmenityRepository({ amenity: { findMany } } as never);
    await expect(repository.listActive()).resolves.toMatchObject([{ code: 'WIFI', active: true }]);
    expect(findMany).toHaveBeenCalledWith({ where: { active: true, businessId: null }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  });
  it('finds exactly the requested amenity ids', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const repository = new PrismaAmenityRepository({ amenity: { findMany } } as never);
    await expect(repository.findManyByIds(['11111111-1111-4111-8111-111111111111'])).resolves.toEqual([]);
    expect(findMany).toHaveBeenCalledWith({ where: { id: { in: ['11111111-1111-4111-8111-111111111111'] } }, orderBy: [{ category: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }] });
  });
  it('maps multiple and partial rows exactly and propagates Prisma errors', async () => {
    const rows = [
      { id: '11111111-1111-4111-8111-111111111111', code: 'A', name: 'Alpha', category: 'CLIMATE', active: true, sortOrder: 1, createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02') },
      { id: '22222222-2222-4222-8222-222222222222', code: 'C', name: 'Charlie', category: 'GENERAL', active: false, sortOrder: 4, createdAt: new Date('2026-01-03'), updatedAt: new Date('2026-01-04') },
    ];
    const findMany = jest.fn().mockResolvedValueOnce(rows).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error('prisma failed'));
    const repository = new PrismaAmenityRepository({ amenity: { findMany } } as never);
    const result = await repository.findManyByIds(rows.map((row) => row.id));
    expect(result.map((item) => ({ id: item.id, code: item.code, name: item.name, category: item.category, active: item.active, sortOrder: item.sortOrder, createdAt: item.createdAt, updatedAt: item.updatedAt }))).toEqual(rows);
    await expect(repository.listActive()).resolves.toEqual([]);
    await expect(repository.findManyByIds([])).rejects.toThrow('prisma failed');
  });
});
