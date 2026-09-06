import { ResourceImage } from '../domain/resource-image.entity';
import { PrismaResourceImageRepository } from './prisma-resource-image.repository';

describe('PrismaResourceImageRepository', () => {
  const image = ResourceImage.create({
    id: '11111111-1111-4111-8111-111111111111',
    businessId: '22222222-2222-4222-8222-222222222222',
    resourceId: '33333333-3333-4333-8333-333333333333',
    storageKey: 'key.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 10,
    sortOrder: 2,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-02'),
  });

  const cover = ResourceImage.create({
    id: '44444444-4444-4444-8444-444444444444',
    businessId: image.businessId,
    resourceId: image.resourceId,
    storageKey: 'cover.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 20,
    sortOrder: 0,
    createdAt: new Date('2026-01-03'),
    updatedAt: new Date('2026-01-04'),
  });

  const createSut = () => {
    const count = jest.fn();
    const aggregate = jest.fn();
    const create = jest.fn();
    const findMany = jest.fn();

    return {
      repository: new PrismaResourceImageRepository({
        resourceImage: {
          count,
          aggregate,
          create,
          findMany,
        },
      } as never),
      count,
      aggregate,
      create,
      findMany,
    };
  };

  it('cuenta y calcula el siguiente orden dentro del Resource', async () => {
    const {
      repository,
      count,
      aggregate,
    } = createSut();

    count.mockResolvedValue(3);

    aggregate.mockResolvedValue({
      _max: {
        sortOrder: 4,
      },
    });

    await expect(
      repository.countByResourceId(image.resourceId),
    ).resolves.toBe(3);

    await expect(
      repository.getNextSortOrder(image.resourceId),
    ).resolves.toBe(5);

    expect(count).toHaveBeenCalledWith({
      where: {
        resourceId: image.resourceId,
      },
    });

    expect(aggregate).toHaveBeenCalledWith({
      where: {
        resourceId: image.resourceId,
      },
      _max: {
        sortOrder: true,
      },
    });
  });

  it('inicia el orden en cero y persiste metadatos exactos', async () => {
    const {
      repository,
      aggregate,
      create,
    } = createSut();

    aggregate.mockResolvedValue({
      _max: {
        sortOrder: null,
      },
    });

    create.mockResolvedValue({
      id: image.id,
      businessId: image.businessId,
      resourceId: image.resourceId,
      storageKey: image.storageKey,
      mimeType: image.mimeType,
      sizeBytes: image.sizeBytes,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt,
      updatedAt: image.updatedAt,
    });

    await expect(
      repository.getNextSortOrder(image.resourceId),
    ).resolves.toBe(0);

    const result = await repository.create(image);

    expect(result.id).toBe(image.id);
    expect(result.storageKey).toBe('key.jpg');

    expect(create).toHaveBeenCalledWith({
      data: {
        id: image.id,
        businessId: image.businessId,
        resourceId: image.resourceId,
        storageKey: image.storageKey,
        mimeType: image.mimeType,
        sizeBytes: image.sizeBytes,
        sortOrder: image.sortOrder,
      },
    });
  });

  it('lista en una sola consulta las portadas del Business', async () => {
    const {
      repository,
      findMany,
    } = createSut();

    findMany.mockResolvedValue([
      {
        id: cover.id,
        businessId: cover.businessId,
        resourceId: cover.resourceId,
        storageKey: cover.storageKey,
        mimeType: cover.mimeType,
        sizeBytes: cover.sizeBytes,
        sortOrder: cover.sortOrder,
        createdAt: cover.createdAt,
        updatedAt: cover.updatedAt,
      },
    ]);

    await expect(
      repository.listCoversByBusinessId(
        image.businessId,
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        id: cover.id,
        businessId: cover.businessId,
        resourceId: cover.resourceId,
        sortOrder: 0,
      }),
    ]);

    expect(findMany).toHaveBeenCalledTimes(1);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        businessId: image.businessId,
        sortOrder: 0,
      },
      orderBy: [
        {
          resourceId: 'asc',
        },
        {
          id: 'asc',
        },
      ],
    });
  });
});