import { BusinessStatus } from '../../business/business.contract';
import { ResourceImage } from '../domain/resource-image.entity';
import type { ResourceImageRepository } from '../domain/resource-image.repository';
import { ResourceStatus } from '../domain/resource-status.enum';
import type { ResourceRepository } from '../domain/resource.repository';
import {
  InvalidResourceImageOrderError,
  ReorderResourceImagesUseCase,
} from './reorder-resource-images.use-case';
import {
  ResourceArchivedError,
  ResourceBusinessArchivedError,
} from './update-resource.use-case';

const businessId =
  '67678b28-1e40-436a-9c23-0ebfb8eca59b';
const resourceId =
  'de5f5f6e-ae4e-4b22-9aa3-7ca5b098661a';

const imageIds = [
  '13981835-1257-4279-90ef-334ef196813c',
  '0e3ad100-aabc-4e60-ac28-a182917bd173',
  '63d98eb0-fdb5-4f45-a847-14d7573026cf',
];

function resourceImage(
  id: string,
  sortOrder: number,
): ResourceImage {
  return ResourceImage.create({
    id,
    businessId,
    resourceId,
    storageKey: `images/${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 100,
    sortOrder,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
}

describe('ReorderResourceImagesUseCase', () => {
  const businesses = {
    findById: jest.fn(),
  };

  const resources = {
    findByIdAndBusinessId: jest.fn(),
  };

  const images = {
    listByResourceId: jest.fn(),
    reorder: jest.fn(),
  };

  let useCase: ReorderResourceImagesUseCase;

  beforeEach(() => {
    jest.clearAllMocks();

    businesses.findById.mockResolvedValue({
      id: businessId,
      status: BusinessStatus.ACTIVE,
    });

    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.ACTIVE,
    });

    images.listByResourceId.mockResolvedValue(
      imageIds.map((id, index) =>
        resourceImage(id, index),
      ),
    );

    images.reorder.mockResolvedValue(undefined);

    useCase = new ReorderResourceImagesUseCase(
      businesses as never,
      resources as unknown as ResourceRepository,
      images as unknown as ResourceImageRepository,
    );
  });

  it('persiste exactamente el nuevo orden completo', async () => {
    const reordered = [
      imageIds[2],
      imageIds[0],
      imageIds[1],
    ];

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds: reordered,
      }),
    ).resolves.toBeUndefined();

    expect(images.reorder).toHaveBeenCalledWith(
      resourceId,
      reordered,
    );
  });

  it('rechaza identificadores duplicados', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds: [
          imageIds[0],
          imageIds[0],
          imageIds[2],
        ],
      }),
    ).rejects.toBeInstanceOf(
      InvalidResourceImageOrderError,
    );

    expect(images.reorder).not.toHaveBeenCalled();
  });

  it('requiere incluir todas las imágenes persistidas', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds: [
          imageIds[0],
          imageIds[1],
        ],
      }),
    ).rejects.toBeInstanceOf(
      InvalidResourceImageOrderError,
    );

    expect(images.reorder).not.toHaveBeenCalled();
  });

  it('rechaza una imagen que no pertenece al Resource', async () => {
    const foreignImageId =
      '4d267a60-b1c5-42a3-86d1-e4d61f3f2e19';

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds: [
          imageIds[0],
          imageIds[1],
          foreignImageId,
        ],
      }),
    ).rejects.toBeInstanceOf(
      InvalidResourceImageOrderError,
    );

    expect(images.reorder).not.toHaveBeenCalled();
  });

  it('rechaza identificadores de imagen inválidos', async () => {
    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds: [
          imageIds[0],
          'invalid',
          imageIds[2],
        ],
      }),
    ).rejects.toBeInstanceOf(
      InvalidResourceImageOrderError,
    );

    expect(images.reorder).not.toHaveBeenCalled();
  });

  it('rechaza un Business archivado', async () => {
    businesses.findById.mockResolvedValue({
      id: businessId,
      status: BusinessStatus.ARCHIVED,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds,
      }),
    ).rejects.toBeInstanceOf(
      ResourceBusinessArchivedError,
    );
  });

  it('rechaza un Resource archivado', async () => {
    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.ARCHIVED,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds,
      }),
    ).rejects.toBeInstanceOf(
      ResourceArchivedError,
    );
  });

  it('permite reordenar imágenes de un Resource fuera de servicio', async () => {
    resources.findByIdAndBusinessId.mockResolvedValue({
      id: resourceId,
      status: ResourceStatus.OUT_OF_SERVICE,
    });

    await expect(
      useCase.execute({
        businessId,
        resourceId,
        imageIds,
      }),
    ).resolves.toBeUndefined();
  });
});